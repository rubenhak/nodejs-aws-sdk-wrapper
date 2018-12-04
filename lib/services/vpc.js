const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSVpcClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    create(cidr, tags)
    {
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
        };

        this.logger.verbose('Fetching vpc...',  params);
        return this._ec2.describeVpcs(params)
            .then(result => {
                var vpc = null;
                if (result.Vpcs.length > 0) {
                    vpc = result.Vpcs[0];
                }
                if (vpc) {
                    if (vpc.CidrBlock != cidr)
                    {
                        throw new Error('The vpc is present but the CIDR block does not match');
                    }
                }
                if (!vpc) {
                    return this._create(cidr);
                }
                return vpc;
            })
            .then(vpc => {
                return this._prepare(vpc, tags);
            })
            .then(vpc => {
                this.logger.debug('Fetched VPC:', vpc);
                return vpc;
            });
    }

    queryAll(tags)
    {
        var params = {

        };

        if (tags && _.keys(tags).length > 0) {
            params.Filters = _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }));
        }

        this.logger.verbose('Fetching vpcs ...',  params);
        return this._ec2.describeVpcs(params)
            .then(result => {
                var vpcs = result.Vpcs;
                return Promise.serial(vpcs, x => this._fetchAllAttributes(x));
            });
    }

    _create(cidr)
    {
        var params = {
            CidrBlock: cidr
        };
        this.logger.info('Creating VPC %s...', cidr);
        this.logger.verbose('Creating VPC...', params);
        return this._ec2.createVpc(params)
            .then(result => {
                var vpc = result.Vpc;
                this.logger.verbose('VPC created:', vpc);
                return vpc;
            });
    }

    _prepare(vpc, tags) {
        this.logger.verbose('Preparing VPC...', vpc);
        return Promise.resolve()
            .then(() => {
                return this._waitReady(vpc);
            })
            .then(() => {
                return this.parent.Ec2utils.setTags(vpc.VpcId, vpc.Tags, tags);
            })
            .then(() => this.query(vpc.VpcId))
            ;
    }

    query(vpcId) {
        var params = {
            VpcIds: [
                vpcId
            ]
        };
        return this._ec2.describeVpcs(params)
            .then(result => {
                if (result.Vpcs.length > 0) {
                    var vpc = result.Vpcs[0];
                    return this._fetchAllAttributes(vpc);
                }
                return null;
            });
    }

    _fetchAllAttributes(vpc)
    {
        this.logger.silly('_fetchAllAttributes... %s', '', vpc);

        return Promise.resolve(vpc)
            .then(x => this._fetchAttrubute(x, 'enableDnsHostnames'))
            .then(x => this._fetchAttrubute(x, 'enableDnsSupport'));
    }

    _fetchAttrubute(vpc, name)
    {
        this.logger.silly('_fetchAllAttribute %s...', name, vpc);

        return this._queryAttribute(vpc.VpcId, name)
            .then(value => {
                if (!vpc.Attributes) {
                    vpc.Attributes = {};
                }
                vpc.Attributes[name] = value;
                return vpc;
            });
    }

    _queryAttribute(vpcId, name)
    {
        var params = {
            Attribute: name,
            VpcId: vpcId
        };
        this.logger.verbose('VPC::_queryAttribute %s :: %s...', vpcId, name, params);

        return this._ec2.describeVpcAttribute(params)
            .then(result => {
                var valueNode = result[_.upperFirst(name)];
                return valueNode.Value;
            });
    }

    setupAttribute(vpcId, name, value)
    {
        var params = {
            VpcId: vpcId
        };
        params[_.upperFirst(name)] = {
            Value: value
        };

        this.logger.info('Vpc::setupAttribute %s :: %s = %s...', vpcId, name, value, params);
        return this._ec2.modifyVpcAttribute(params);
    }

    delete(vpcId) {
        var params = {
            VpcId: vpcId
        };
        this.logger.info('Deleting VPC %s...', vpcId);
        return this._ec2.deleteVpc(params)
            .then(result => {
                return null;
            });
    }

    _waitReady(vpc)
    {
        if (vpc.State == 'available') {
            return vpc;
        }

        this.logger.info('Waiting vpc %s ready...', vpc.VpcId);
        return Promise.timeout(1000)
            .then(() => {
                return this.query(vpc.VpcId);
            })
            .then(vpc => {
                return this._waitReady(vpc);
            });
    }
    
    createPeeringConnection(vpcId, peerConfig, tags)
    {
        var params = _.clone(peerConfig);
        params.VpcId = vpcId;

        this.logger.verbose('Creating vpc peering %s => %s...',  vpcId, params.PeerVpcId);
        this.logger.verbose('Creating vpc peering connection...',  params);
        return this._ec2.createVpcPeeringConnection(params)
            .then(result => {
                var connection = result.VpcPeeringConnection;
                this.logger.debug('Created VPC Peering connection:', connection);

                if (tags) {
                    var id = connection.VpcPeeringConnectionId;
                    return Promise.resolve()
                        .then(() => {
                            return this.parent.Ec2utils.setTags(id, connection.Tags, tags);
                        })
                        .then(() => this.queryPeeringConnection(id));
                } else {
                    return connection;
                }
            });
    }
        
    queryRequesterPeeringConnections(vpcId, tags)
    {
        var filters = [{
            Name: 'requester-vpc-info.vpc-id',
            Values: [vpcId]
        }];
        return this._queryPeeringConnections(filters, tags);
    }

    queryAcceptorPeeringConnections(vpcId, tags)
    {
        var filters = [{
            Name: 'accepter-vpc-info.vpc-id',
            Values: [vpcId]
        }];
        return this._queryPeeringConnections(filters, tags);
    }

    _queryPeeringConnections(filters, tags)
    {
        var params = {
            Filters: [{
                Name: 'status-code',
                Values: [
                    'pending-acceptance',
                    'provisioning',
                    'active'
                ]
            }]
        }

        if (filters) {
            params.Filters = _.concat(params.Filters, filters);
        }

        if (tags) {
            for(var tag of _.keys(tags)) {
                var tagFilter = {
                    Name: 'tag:' + tag,
                    Values: [
                        tags[tag]
                    ]
                };
                params.Filters.push(tagFilter);
            }
        }

        this.logger.verbose('Query vpc peering connections...',  params);
        return this._ec2.describeVpcPeeringConnections(params)
            .then(result => {
                var connections = result.VpcPeeringConnections;
                return connections;
            });
    }

    deletePeeringConnection(id)
    {
        var params = {
            VpcPeeringConnectionId: id
        }

        this.logger.verbose('Deleting vpc peering connection %s...',  id);
        this.logger.verbose('Deleting vpc peering connection...',  params);
        return this._ec2.deleteVpcPeeringConnection(params)
            .then(result => {
                this.logger.debug('VPC Peering connection deleted.');
            });
    }

    queryPeeringConnection(id)
    {
        var params = {
            VpcPeeringConnectionIds: [id]
        }
        return this._ec2.describeVpcPeeringConnections(params)
            .then(result => {
                var obj = null;
                if (result.VpcPeeringConnections) {
                    if (result.VpcPeeringConnections.length > 0) {
                        obj = result.VpcPeeringConnections[0];
                    }
                }
                if (obj) {
                    if ((obj.Status.Code != 'active') && 
                        (obj.Status.Code != 'pending-acceptance') && 
                        (obj.Status.Code != 'provisioning'))
                    {
                        return null;
                    }
                }
                return obj;
            });
    }

    acceptPeeringConnection(id)
    {
        var params = {
            VpcPeeringConnectionId: id
        }

        this.logger.debug('Accepting vpc peering connection %s...',  id);
        this.logger.verbose('Accepting vpc peering connection...',  params);
        return this._ec2.acceptVpcPeeringConnection(params)
            .then(result => {
                this.logger.debug('VPC Peering connection accepted.');
                return result.VpcPeeringConnection;
            });
    }

}

module.exports = AWSVpcClient;
