const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSRouteTableClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    create(vpcId, tags)
    {
        var params = {
            VpcId: vpcId
        }
        this.logger.verbose('Creating RouteTable  %s...', vpcId);
        return this._ec2.createRouteTable(params)
            .then(rt => {
                rt = rt.RouteTable;
                this.logger.debug('Created Intermediate RouteTable: ', rt);
                return Promise.timeout(2000)
                    .then(() => this.parent.Ec2utils.setTags(rt.RouteTableId, rt.Tags, tags))
                    .then(() => Promise.timeout(2000))
                    .then(() => this.query(rt.RouteTableId));
            })
            .then(result => {
                this.logger.debug('Created RouteTable: ', result);
                return result;
            });
    }

    delete(id)
    {
        var params = {
            RouteTableId: id
        }
        this.logger.verbose('Deleting RouteTable %s...', id);
        return this._ec2.deleteRouteTable(params)
            .then(result => {
                this.logger.debug('RouteTable %s deleted. ', result);
                return result;
            });
    }

    fetchMain(vpcId, tags)
    {
        this.logger.verbose('Fetching Main RouteTable  %s...', vpcId);

        return this._mainRouteTable(vpcId)
            .then(rt => {
                return this.parent.Ec2utils.setTags(rt.RouteTableId, rt.Tags, tags)
                    .then(() => {
                        return this._mainRouteTable(vpcId);
                    });
            })
            .then(result => {
                this.logger.debug('Fetched RouteTable. %s', '', result);
                return result;
            });
    }

    createRoute(rtId, destination, config) {
        var params = _.clone(config);
        params.RouteTableId = rtId;
        params.DestinationCidrBlock = destination;

        this.logger.verbose('Creating Route...', params);
        return this._ec2.createRoute(params)
            .then(result => {
                this.logger.verbose('Route created', result);
                return result;
            });
    }

    deleteRoute(rtId, destination) {
        var params = {
            DestinationCidrBlock: destination,
            RouteTableId: rtId
        };

        this.logger.verbose('Deleting Route... ', params);
        return this._ec2.deleteRoute(params)
            .then(result => {
                this.logger.verbose('Route deleted ', result);
            });
    }

    queryAll(tags)
    {
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
        };
        return this._ec2.describeRouteTables(params)
            .then(result => {
                return result.RouteTables;
            });
    }

    queryForVpc(vpcId, excludeMain) {
        var params = {
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [ vpcId ]
                }
            ]
        };
        return this._ec2.describeRouteTables(params)
            .then(result => {
                var tables = result.RouteTables;
                if (excludeMain) {
                    tables = tables.filter(rt => {
                        if (rt.Associations) {
                            if (_.some(rt.Associations, x => x.Main)) {
                                return false;
                            }
                        }
                        return true;
                    })
                }
                return tables;
            });
    }

    query(id)
    {
        var params = {
            RouteTableIds: [
                id
            ]
        };
        return this._ec2.describeRouteTables(params)
            .then(result => {
                if (result.RouteTables.length > 0) {
                    return result.RouteTables[0];
                }
                return null;
            });
    }

    _mainRouteTable(vpcId) {
        var params = {
            Filters: [
                {
                    Name: 'association.main',
                    Values: [ 'true' ]
                },
                {
                    Name: 'vpc-id',
                    Values: [ vpcId ]
                }
            ]
        };
        return this._ec2.describeRouteTables(params)
            .then(result => {
                if (result.RouteTables.length > 0) {
                    return result.RouteTables[0];
                }
                return null;
            });
    }

    delete(rtId) {
        var params = {
            RouteTableId: rtId
        };
        this.logger.info('Deleting RouteTable %s...', rtId);
        return this._ec2.deleteRouteTable(params)
            .then(result => {
                return null;
            });
    }

}

module.exports = AWSRouteTableClient;
