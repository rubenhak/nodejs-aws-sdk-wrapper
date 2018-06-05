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
        return this._ec2.createInternetGateway({})
            .then(result => {
                var ig = result.InternetGateway;
                this.logger.info('Created InternetGateway: ', ig);
                igId = ig.InternetGatewayId;
                return ig;
            })
            .then(() => this._waitReady(igId))
            .then(ig => {
                return this.parent.Ec2utils.setTags(igId, ig.Tags, tags);
            })
            .then(() => {
                return this.query(igId);
            })
            .then(ig =>
            {
                this.logger.verbose('Final Prepared InternetGateway:', ig);
                return ig;
            })
            ;
    }

    setupTags(igId, currentTags, newTags)
    {
        return this.parent.Ec2utils.setupTags(igId, currentTags, newTags);
    }

    _waitReady(igId)
    {
        this.logger.info('Waiting InternetGateway %s ready...', igId);
        return Promise.timeout(1000)
            .then(() => this.query(igId))
            ;
    }

    queryAll(tags) {
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
        };
        return this._ec2.describeInternetGateways(params)
            .then(result => {
                return result.InternetGateways;
            });
    }

    queryForVpc(vpcId)
    {
        var params = {
            Filters: [{
                Name: 'attachment.vpc-id',
                Values: [ vpcId ]
            }]
        };
        return this._ec2.describeInternetGateways(params)
            .then(result => {
                if (result.InternetGateways.length == 0) {
                    return null;
                }
                return result.InternetGateways[0];
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
        return this._ec2.describeInternetGateways(params)
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
        return this._ec2.deleteInternetGateway(params)
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
        return this._ec2.attachInternetGateway(params)
            .then(result => {
                this.logger.info('InternetGateway %s attach result:', igId, JSON.stringify(result));
                return null;
            })
            .catch(reason => {
                if (reason.code == 'Resource.AlreadyAssociated') {
                    this.logger.warn('IG %s is already attached. Original reason:', igId, reason);
                    return this.query(igId)
                        .then(ig => {
                            this.logger.info('My IG: ', ig);
                            if (_.some(ig.Attachments, x => x.VpcId == vpcId)) {
                                return;
                            } else {
                                throw reason;
                            }
                        });
                } else {
                    throw reason;
                }
            });
    }

    detach(igId, vpcId)
    {
        var params = {
            InternetGatewayId: igId,
            VpcId: vpcId
        };
        this.logger.info('Detaching InternetGateway %s from %s...', igId, vpcId);
        return this._ec2.detachInternetGateway(params)
            .then(result => {
                return null;
            });
    }

}

module.exports = AWSInternetGatewayClient;
