const Promise = require('the-promise');
const _ = require('lodash');

class AWSInternetGatewayClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent._ec2;
    }

    // fetchForCluster(createIfNotPresent, vpc, cluster)
    // {
    //     this.logger.verbose('Fetching InternetGateway %s :: %s...', vpc.VpcId, cluster);
    //
    //     return this.query(vpc.VpcId)
    //         .then(result => {
    //             if (!createIfNotPresent || result) {
    //                 return result;
    //             } else {
    //                 return this.createForCluster(vpc, cluster);
    //             }
    //         })
    //         .then(result => {
    //             this.logger.debug('Fetched InternetGateway. %s', '', result);
    //             return result;
    //         });
    // }

    create(cluster)
    {
        var igId = null;
        this.logger.info('Creating InternetGateway...');
        return this._ec2.createInternetGateway({}).promise()
            .then(result => {
                var ig = result.InternetGateway;
                igId = ig.InternetGatewayId;
                return ig;
            })
            .then(ig => {
                return this.parent.Ec2utils.setTags(igId, ig.Tags, { Name : cluster, 'berlioz:cluster': cluster });
            })
            .then(() => {
                return this.query(igId);
            });
    }

    createForCluster(vpcId, cluster)
    {
        var igId = null;
        this.logger.info('Creating InternetGateway...');
        return this._ec2.createInternetGateway({}).promise()
            .then(result => {
                var ig = result.InternetGateway;
                igId = ig.InternetGatewayId;
                return ig;
            })
            .then(ig => {
                return this.parent.Ec2utils.setTags(igId, ig.Tags, { Name : cluster, 'berlioz:cluster': cluster });
            })
            .then(() => {
                return this._ec2.attachInternetGateway({
                        InternetGatewayId: igId,
                        VpcId: vpcId
                    }).promise();
            })
            .then(() => {
                return this.query(igId);
            });
    }

    queryAll(cluster) {
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [ cluster ]
                }
            ]
        };
        return this._ec2.describeInternetGateways(params).promise()
            .then(result => {
                return result.InternetGateways;
            });
    }

    query(id) {
        var params = {
            Filters: [
                {
                    Name: 'internet-gateway-id',
                    Values: [
                        id
                    ]
                }
            ]
        };
        return this._ec2.describeInternetGateways(params).promise()
            .then(result => {
                if (result.InternetGateways.length > 0) {
                    var ig = result.InternetGateways[0];
                    return ig;
                } else {
                    return null;
                }
            });
    }

    deleteAndDetach(ig) {
        return Promise.serial(ig.Attachments, x => {
                return this.detach(ig.InternetGatewayId, x.VpcId);
            })
            .then(() => this.delete(ig.InternetGatewayId));
    }

    delete(igId) {
        var params = {
            InternetGatewayId: igId
        };
        this.logger.info('Deleting InternetGateway %s...', igId);
        return this._ec2.deleteInternetGateway(params).promise()
            .then(result => {
                return null;
            });
    }

    attach(igId, vpcId)
    {
        var params = {
            InternetGatewayId: igId,
            VpcId: vpcId
        };
        this.logger.info('Attaching InternetGateway %s to %s...', igId, vpcId);
        return this._ec2.attachInternetGateway(params).promise()
            .then(result => {
                return null;
            });
    }

    detach(igId, vpcId)
    {
        var params = {
            InternetGatewayId: igId,
            VpcId: vpcId
        };
        this.logger.info('Detaching InternetGateway %s from %s...', igId, vpcId);
        return this._ec2.detachInternetGateway(params).promise()
            .then(result => {
                return null;
            });
    }

}

module.exports = AWSInternetGatewayClient;
