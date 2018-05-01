const Promise = require('the-promise');
const _ = require('lodash');
const uuid = require('uuid/v4');

class AWSHostedZoneClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._region = parent.region;
        this._route53 = parent.getAwsService('route53');
    }

    _query(name) {
        return this._route53.listHostedZonesByName({
                DNSName: name + '.'
            })
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
        return this._route53.getHostedZone(params)
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

    createPrivate(name, vpcId, tags) {
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
        return this._create(params, tags);
    }

    createPublic(name, tags) {
        var params = {
            CallerReference: uuid(),
            Name: name,
            HostedZoneConfig: {
                Comment: 'Public zone for ' + name,
                PrivateZone: false
            }
        };
        return this._create(params, tags);
    }

    _create(params, tags)
    {
        this.logger.info('Creating hosted zone for %s...', params.Name);
        this.logger.verbose('Creating hosted zone ...%s', '', params);
        var zoneId = null;
        return this._route53.createHostedZone(params)
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

    registerRecord(zone, resourceRecordSet) {
        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: "UPSERT",
                    ResourceRecordSet: resourceRecordSet
                }],
            },
            HostedZoneId: zone.Id
        };
        this.logger.info('Registering hosted zone record %s ...', zone.Name);
        this.logger.debug('Registering hosted zone %s record...', zone.Name, params);
        return this._route53.changeResourceRecordSets(params)
            .then(data => {
                this.logger.debug('Created hosted zone record. ', data);
            });
    }

    listRecordSets(hostedZoneId)
    {
        var params = {
            HostedZoneId: hostedZoneId
        };
        this.logger.silly('Querying RecordSets from %s...', hostedZoneId);
        return this._route53.listResourceRecordSets(params)
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
        this.logger.info('Deleting RecordSet %s ...', hostedZoneId, params);
        return this._route53.changeResourceRecordSets(params)
            .then(data => {
                this.logger.verbose('RecordSet deleted %s', data);
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
        return this._route53.deleteHostedZone(params)
            .then(result => {
                this.logger.info('HostedZone %s deleted', hostedZoneId);
            });
    }

    queryAll(tags, result, marker)
    {
        if (!result) {
            result = [];
        }
        var params = {
            Marker: marker
        }
        return this._route53.listHostedZones(params)
            .then(data => {
                return Promise.serial(data.HostedZones, zone => this.queryById(zone.Id))
                    .then(zones => {
                        for(var zone of zones) {
                            if  ((!tags) || (_.keys(tags).every(x => {
                                return zone.Tags[x] == tags[x];
                            }))) {
                                result.push(zone);
                            }
                        }
                        if (data.IsTruncated) {
                            return this.queryAll(tags, result, data.NextMarker);
                        }
                        return result;
                    });
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
        return this._route53.changeTagsForResource(params)
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
        return this._route53.listTagsForResource(params)
            .then(data => {
                this.logger.silly('getTags result%s', '', data);
                var tags = {};
                for (var tag of data.ResourceTagSet.Tags) {
                    tags[tag.Key] = tag.Value;
                }
                return tags;
            });
    }


    associateVPC(hostedZoneId, vpcId, region)
    {
        var params = {
            HostedZoneId: hostedZoneId,
            VPC: {
                VPCId: vpcId,
                VPCRegion: this._region
            }
        };
        if (region) {
            params.VPC.VPCRegion = region;
        }
        this.logger.silly('Associate HostedZone %s with %s...', hostedZoneId, vpcId);
        return this._route53.associateVPCWithHostedZone(params)
            .then(data => {
                this.logger.silly('Hosted zone associated with Vpc: %s', '', data);
            });
    }

    disassociateVPC(hostedZoneId, vpcId, region)
    {
        var params = {
            HostedZoneId: hostedZoneId,
            VPC: {
                VPCId: vpcId,
                VPCRegion: this._region
            }
        };
        if (region) {
            params.VPC.VPCRegion = region;
        }
        this.logger.silly('Disassociate HostedZone %s with %s...', hostedZoneId, vpcId);
        return this._route53.disassociateVPCFromHostedZone(params)
            .then(data => {
                this.logger.silly('Hosted zone disassociated with Vpc: %s', '', data);
            });
    }

    setupVpc(hostedZone, vpcId)
    {
        return Promise.resolve()
            .then(() => {
                return this.associateVPC(hostedZone.Id, vpcId);
            })
            .then(() => {
                return Promise.serial(hostedZone.VPCs, vpc => {
                    if (vpc.VPCId != vpcId)
                    {
                        return this.disassociateVPC(hostedZone.Id, vpc.VPCId, vpc.VPCRegion);
                    }
                });
            });
    }

}

module.exports = AWSHostedZoneClient;
