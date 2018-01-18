const _ = require('lodash');

class AWSRouteTableClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ec2 = parent._ec2;
    }

    fetchMainForCluster(createIfNotPresent, vpcId, cluster)
    {
        this._logger.verbose('Fetching RouteTable  %s :: %s...', vpcId, cluster);

        return this._mainRouteTable(vpcId)
            .then(rt => {
                if (createIfNotPresent) {
                    return this._parent.Ec2utils.setTags(rt.RouteTableId, rt.Tags, { Name : cluster, 'berlioz:cluster': cluster })
                        .then(() => {
                            return this._mainRouteTable(vpcId);
                        });
                }
            })
            .then(result => {
                this._logger.debug('Fetched RouteTable. %s', '', result);
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

        this._logger.verbose('Creating Route... %s', '', params);
        this._logger.info('Creating Route %s :: %s -> %s ...', rt.RouteTableId, destination, gatewayId);
        return this._ec2.createRoute(params).promise()
            .then(result => {
                this._logger.verbose('Route created %s', '', result);
            });
    }


    deleteRoute(rt, destination) {
        var params = {
            DestinationCidrBlock: destination,
            RouteTableId: rt.RouteTableId
        };

        this._logger.verbose('Deleting Route... %s', '', params);
        this._logger.info('Deleting Route %s :: %s ...', rt.RouteTableId, destination);
        return this._ec2.deleteRoute(params).promise()
            .then(result => {
                this._logger.verbose('Route deleted %s', '', result);
            });
    }

    queryAll(cluster)
    {
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [ cluster ]
                }
            ]
        };
        return this._ec2.describeRouteTables(params).promise()
            .then(result => {
                return result.RouteTables;
            });
    }

    query(id)
    {
        var params = {
            RouteTableIds: [
                id
            ]
        };
        return this._ec2.describeRouteTables(params).promise()
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
        return this._ec2.describeRouteTables(params).promise()
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
        this._logger.info('Deleting RouteTable %s...', rtId);
        return this._ec2.deleteRouteTable(params).promise()
            .then(result => {
                return null;
            });
    }

}

module.exports = AWSRouteTableClient;