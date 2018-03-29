const Promise = require('the-promise');
const _ = require('lodash');

class AWSInternetGatewayClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    create(tags)
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
                return this.parent.Ec2utils.setTags(igId, ig.Tags, tags);
            })
            .then(() => {
                return this.query(igId);
            });
    }

    queryAll(tags) {
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
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
