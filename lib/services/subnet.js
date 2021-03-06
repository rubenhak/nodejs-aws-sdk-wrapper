const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSSubnetClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    create(vpc, config, tags)
    {
        var params = _.clone(config);
        params.VpcId = vpc.VpcId;
        this.logger.info('Creating Subnet %s... ', params.CidrBlock);
        this.logger.verbose('Creating Subnet... %s', '', params);
        return this._ec2.createSubnet(params)
            .then(result => {
                var subnet = result.Subnet;
                this.logger.verbose('Subnet created:', subnet);
                return subnet;
            })
            .then(subnet =>
            {
                return this._prepareSubnet(subnet, tags);
            })
            .then(subnet =>
            {
                this.logger.verbose('Final Prepared Subnet:', subnet);
                return subnet;
            })
            ;
    }

    queryAll(tags)
    {
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
        };
        this.logger.verbose('Fetching Subnets', params);
        return this._ec2.describeSubnets(params)
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
        return this._ec2.describeSubnets(params)
            .then(result => {
                if (result.Subnets.length > 0) {
                    return result.Subnets[0];
                }
                return null;
            })
            .catch(error => {
                this.logger.error('Could not query subnet: %s', subnetId, error);
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
        this.logger.info('Associating Subnet %s with %s... ', params.SubnetId, params.RouteTableId);
        this.logger.verbose('Associating Subnet... %s', '', params);
        return this._ec2.associateRouteTable(params)
            .then(result => {
                this.logger.verbose('Subnet associated %s', '', result);
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
        this.logger.info('Disassociating Subnet %s from %s... ', subnet.SubnetId, routeTable.RouteTableId);
        this.logger.verbose('Disassociating Subnet... %s', '', params);
        return this._ec2.disassociateRouteTable(params)
            .then(result => {
                this.logger.verbose('Subnet disassociated %s', '', result);
            });
    }

    delete(subnetId) {
        var params = {
            SubnetId: subnetId
        };
        this.logger.info('Deleting Subnet %s...', subnetId);
        return this._ec2.deleteSubnet(params)
            .then(result => {
                return null;
            });
    }

    _waitReady(subnet)
    {
        this.logger.info('Subnet %s is %s', subnet.SubnetId, subnet.State);
        if (subnet.State == 'available') {
            return subnet;
        }

        this.logger.info('Waiting subnet %s ready...', subnet.SubnetId);
        return Promise.timeout(1000)
            .then(() => {
                return this.query(subnet.SubnetId);
            })
            .then(newSubnet => {
                return this._waitReady(newSubnet);
            });
    }

    _prepareSubnet(subnet, tags)
    {
        return Promise.timeout(1000)
            .then(() => this._waitReady(subnet))
            .then(() => this.parent.Ec2utils.setTags(subnet.SubnetId, subnet.Tags, tags))
            .then(() => {
                var params = {
                    SubnetId: subnet.SubnetId,
                    MapPublicIpOnLaunch: {
                        Value: true
                    }
                };
                return this._ec2.modifySubnetAttribute(params);
            })
            .then(() => this.query(subnet.SubnetId));
    }
}

module.exports = AWSSubnetClient;
