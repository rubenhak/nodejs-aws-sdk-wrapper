const Promise = require('the-promise');
const _ = require('lodash');

class AWSSubnetClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ec2 = parent._ec2;
    }

    fetchForCluster(createIfNotPresent, vpc, cluster)
    {
        this._logger.verbose('Fetching Subnet  %s :: %s', vpc, cluster);

        var params = {
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [
                        vpc.VpcId
                    ]
                },
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [
                        cluster
                    ]
                }
            ]
        };
        return this._ec2.describeSubnets(params).promise()
            .then(result => {
                var subnet = null;
                if (result.Subnets.length > 0) {
                    subnet = result.Subnets[0];
                }
                if (!createIfNotPresent || subnet) {
                    return subnet;
                } else {
                    return this.createForCluster(vpc, cluster);
                }
            })
            .then(subnet =>
            {
                if (createIfNotPresent) {
                    return this._prepareSubnet(subnet, cluster);
                }
                return subnet;
            })
            .then(result => {
                this._logger.debug('Fetched Subnet. %s', '', result);
                return result;
            });
    }

    createForCluster(vpc, cluster, config)
    {
        var params = _.clone(config);
        params.VpcId = vpc.VpcId;
        this._logger.info('Creating Subnet %s... ', params.CidrBlock);
        this._logger.verbose('Creating Subnet... %s', '', params);
        return this._ec2.createSubnet(params).promise()
            .then(result => {
                var subnet = result.Subnet;
                this._logger.verbose('Subnet created %s', '', subnet);
                return subnet;
            })
            .then(subnet =>
            {
                return this._prepareSubnet(subnet, cluster);
            });
    }

    queryAll(cluster)
    {
        this._logger.verbose('Fetching Subnets %s', cluster);
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [
                        cluster
                    ]
                }
            ]
        };
        return this._ec2.describeSubnets(params).promise()
            .then(result => {
                var subnet = null;
                return result.Subnets;
            });
    }

    query(subnetId) {
        var params = {
            SubnetIds: [
                subnetId
            ]
        };
        return this._ec2.describeSubnets(params).promise()
            .then(result => {
                if (result.Subnets.length > 0) {
                    return result.Subnets[0];
                }
                return null;
            })
            .catch(error => {
                this._logger.error('Could not query subnet: %s', subnetId, error);
                return null;
            });
    }

    associate(subnet, routeTable) {
        for (var association of routeTable.Associations) {
            if (association.SubnetId == subnet.SubnetId) {
                return Promise.resolve();
            }
        }

        var params = {
            RouteTableId: routeTable.RouteTableId,
            SubnetId: subnet.SubnetId
        };
        this._logger.info('Associating Subnet %s with %s... ', params.SubnetId, params.RouteTableId);
        this._logger.verbose('Associating Subnet... %s', '', params);
        return this._ec2.associateRouteTable(params).promise()
            .then(result => {
                this._logger.verbose('Subnet associated %s', '', result);
            });
    }

    disassociate(subnet, routeTable) {
        var associationId = null;
        for (var association of routeTable.Associations) {
            if (association.SubnetId == subnet.SubnetId) {
                var associationId = association.RouteTableAssociationId;
                break;
            }
        }

        if (!associationId) {
            return Promise.resolve();
        }

        var params = {
            AssociationId: associationId
        };
        this._logger.info('Disassociating Subnet %s from %s... ', subnet.SubnetId, routeTable.RouteTableId);
        this._logger.verbose('Disassociating Subnet... %s', '', params);
        return this._ec2.disassociateRouteTable(params).promise()
            .then(result => {
                this._logger.verbose('Subnet disassociated %s', '', result);
            });
    }

    delete(subnetId) {
        var params = {
            SubnetId: subnetId
        };
        this._logger.info('Deleting Subnet %s...', subnetId);
        return this._ec2.deleteSubnet(params).promise()
            .then(result => {
                return null;
            });
    }

    _waitReady(subnet)
    {
        this._logger.info('Subnet %s is %s', subnet.SubnetId, subnet.State);
        if (subnet.State == 'available') {
            return subnet;
        }

        this._logger.info('Waiting subnet %s ready...', subnet.SubnetId);
        return Promise.timeout(1000)
            .then(() => {
                return this.query(subnet.SubnetId);
            })
            .then(newSubnet => {
                return this._waitReady(newSubnet);
            });
    }

    _prepareSubnet(subnet, cluster)
    {
        return this._parent.Ec2utils.setTags(subnet.SubnetId, subnet.Tags, { Name : cluster, 'berlioz:cluster': cluster })
            .then(() => {
                var params = {
                    SubnetId: subnet.SubnetId,
                    MapPublicIpOnLaunch: {
                        Value: true
                    }
                };
                return this._ec2.modifySubnetAttribute(params).promise();
            })
            .then(() => {
                return this._waitReady(subnet);
            });
    }
}

module.exports = AWSSubnetClient;
