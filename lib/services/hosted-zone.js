const Promise = require('the-promise');
const _ = require('lodash');
const uuid = require('uuid/v4');

class AWSHostedZoneClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._region = parent._region;
        this._route53 = parent._route53;
    }

    fetchForCluster(createIfNotPresent, vpc, cluster)
    {
        this.logger.verbose('Fetching LogGroup %s...', cluster);

        return this._query(cluster)
            .then(zone => {
                if (!createIfNotPresent || zone) {
                    return zone;
                }
                return this.createForCluster(vpc.VpcId, cluster);
            })
            .then(zone => {
                this.logger.debug('Fetched Hosted Zone %s', '', zone);
                return zone;
            });
    }

    _query(name) {
        return this._route53.listHostedZonesByName({
                DNSName: name + '.'
            }).promise()
            .then(data => {
                var zone = _.find(data.HostedZones, x => {
                    return x.Name == name + '.'
                });
                return zone;
            });
    }

    queryById(id) {
        var params = {
            Id: id
        }
        this.logger.verbose('Querying HostedZone %s...', id);
        return this._route53.getHostedZone(params).promise()
            .then(data => {
                var zone = data;
                zone.Id = zone.HostedZone.Id;
                return this.getTags(zone.Id)
                    .then(tags => {
                        zone.Tags = tags;
                        return zone;
                    });
            })
            .then(zone => {
                return this.listRecordSets(zone.Id)
                    .then(records => {
                        zone.Records = records;
                        this.logger.verbose('HostedZone: %s', '', zone);
                        return zone;
                    });
            });
    }

    create(vpcId, name, tags) {
        var params = {
                CallerReference: uuid(),
                Name: name,
                HostedZoneConfig: {
                    Comment: 'Private zone for ' + name,
                    PrivateZone: true
                },
                VPC: {
                    VPCId: vpcId,
                    VPCRegion: this._region
                }
            };
        this.logger.info('Creating hosted zone for %s...', params.Name);
        this.logger.verbose('Creating hosted zone ...%s', '', params);
        var zoneId = null;
        return this._route53.createHostedZone(params).promise()
            .then(result => {
                this.logger.verbose('Created hosted zone %s', '', result);
                var hostedZone = result.HostedZone;
                zoneId = hostedZone.Id;
                return hostedZone;
            })
            .then(() => {
                return this._setTags(zoneId, tags);
            })
            .then(() => {
                return this.queryById(zoneId);
            })
    }

    registerRecord(zone, domain, address) {
        var dnsName =  domain + '.' + zone.Name;
        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: "UPSERT",
                    ResourceRecordSet: {
                        Name: dnsName,
                        ResourceRecords: [{
                            Value: address
                        }],
                        TTL: 60,
                        Type: "A"
                    }
                }],
            },
            HostedZoneId: zone.Id
        };
        this.logger.info('Registering hosted zone record %s -> %s...', dnsName, address);
        this.logger.debug('Registering hosted zone record...%s', '', params);
        return this._route53.changeResourceRecordSets(params).promise()
            .then(data => {
                this.logger.debug('Created hosted zone record %s', '', data);
                return dnsName.substr(0, dnsName.length - 1);
            });
    }

    listRecordSets(hostedZoneId)
    {
        var params = {
            HostedZoneId: hostedZoneId
        };
        this.logger.silly('Querying RecordSets from %s...', hostedZoneId);
        return this._route53.listResourceRecordSets(params).promise()
            .then(data => {
                this.logger.silly('RecordSets: %s', '', data);
                return data.ResourceRecordSets;
            });
    }

    deleteRecordSet(hostedZoneId, recordSet)
    {
        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: "DELETE",
                    ResourceRecordSet: recordSet
                }],
            },
            HostedZoneId: hostedZoneId
        };
        this.logger.info('Deleting RecordSet %s from %s...', hostedZoneId, recordSet.Name);
        return this._route53.changeResourceRecordSets(params).promise()
            .then(data => {
                this.logger.verbose('RecordSet deleted %s', '', data);
            });
    }

    remove(hostedZoneId) {
        var params = {
            Id: hostedZoneId
        };
        this.logger.info('Deleting HostedZone %s...', hostedZoneId);
        return this.listRecordSets(hostedZoneId)
            .then(recordSets => {
                this.logger.debug('RecordSets %s', '', recordSets);
                return Promise.serial(recordSets.filter(x => x.Type == 'A'), recordSet => {
                    return this.deleteRecordSet(hostedZoneId, recordSet);
                });
            })
            .then(() => this.delete(hostedZoneId));
    }

    delete(hostedZoneId) {
        var params = {
            Id: hostedZoneId
        };
        this.logger.info('Deleting HostedZone %s...', hostedZoneId);
        return this._route53.deleteHostedZone(params).promise()
            .then(result => {
                this.logger.info('HostedZone %s deleted', hostedZoneId);
            });
    }

    queryAll(result, marker)
    {
        if (!result) {
            result = [];
        }
        var params = {
            Marker: marker
        }
        return this._route53.listHostedZones(params).promise()
            .then(data => {
                // this.logger.info('HostedZoneQueryResult%s', '', data);
                return Promise.serial(data.HostedZones, zone => {
                    return this.queryById(zone.Id)
                        // .then(tags => {
                        //     zone.Tags = tags;
                        // });
                })
                .then(zones => {
                    result = result.concat(zones);
                    if (data.IsTruncated) {
                        return this.queryAll(result, data.NextMarker);
                    }
                    return result;
                });
            });
    }

    queryAllForCluster(cluster)
    {
        return this.queryAll()
            .then(result => {
                return result.filter(x => x.Tags['berlioz:cluster'] == cluster);
            });
    }

    _setTags(hostedZoneId, tags)
    {
        var params = {
            ResourceId: hostedZoneId,
            ResourceType: "hostedzone",
            AddTags: []
        };
        for (var tag of _.keys(tags)) {
            params.AddTags.push({
                Key: tag,
                Value: tags[tag]
            });
        }
        return this._route53.changeTagsForResource(params).promise()
            .then(result => {
                this.logger.info('HostedZone tag change result%s', '', result);
                return null;
            });
    }

    getTags(hostedZoneId) {
        var params = {
            ResourceId: hostedZoneId,
            ResourceType: "hostedzone"
        };
        return this._route53.listTagsForResource(params).promise()
            .then(data => {
                this.logger.silly('getTags result%s', '', data);
                var tags = {};
                for (var tag of data.ResourceTagSet.Tags) {
                    tags[tag.Key] = tag.Value;
                }
                return tags;
            });
    }

}

module.exports = AWSHostedZoneClient;
