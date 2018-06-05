const _ = require('lodash');

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
                return this.parent.Ec2utils.setTags(rt.RouteTableId, rt.Tags, tags)
                    .then(() => {
                        return this.query(rt.RouteTableId);
                    });
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

    createRoute(rt, gatewayId, destination) {
        var params = {
            DestinationCidrBlock: destination,
            GatewayId: gatewayId
        };

        for(var route of rt.Routes) {
            var routeCmp = _.clone(route);
            _.unset(routeCmp, 'State');
            _.unset(routeCmp, 'Origin');
            if (_.isEqual(routeCmp, params)) {
                return Promise.resolve();
            }
        }

        params.RouteTableId = rt.RouteTableId;

        this.logger.verbose('Creating Route... %s', '', params);
        this.logger.info('Creating Route %s :: %s -> %s ...', rt.RouteTableId, destination, gatewayId);
        return this._ec2.createRoute(params)
            .then(result => {
                this.logger.verbose('Route created %s', '', result);
            });
    }


    deleteRoute(rt, destination) {
        var params = {
            DestinationCidrBlock: destination,
            RouteTableId: rt.RouteTableId
        };

        this.logger.verbose('Deleting Route... %s', '', params);
        this.logger.info('Deleting Route %s :: %s ...', rt.RouteTableId, destination);
        return this._ec2.deleteRoute(params)
            .then(result => {
                this.logger.verbose('Route deleted %s', '', result);
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
