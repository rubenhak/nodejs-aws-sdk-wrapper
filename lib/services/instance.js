const Promise = require('the-promise');
const _ = require('lodash');

class AWSInstanceClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent._ec2;
    }

    queryAll(cluster, nextToken, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [ cluster ]
                }
            ]
        }
        if (nextToken) {
            params.NextToken = nextToken;
        }
        return this._ec2.describeInstances(params).promise()
            .then(data => {
                for (var reservation of data.Reservations) {
                    for (var instance of reservation.Instances) {
                        if (instance.State.Name != 'terminated') {
                            results.push(instance);
                        }
                    }
                }
                if (data.NextToken) {
                    return Promise.resolve(this.queryAll(cluster, data.NextToken, results));
                } else {
                    return results;
                }
            });
    }

    query(id) {
        return this._ec2.describeInstances({ InstanceIds: [ id ] }).promise()
            .then(data => {
                var instance = data.Reservations[0].Instances[0];
                return instance;
            });
    }

    run(config, waitStabilize)
    {
        var tags = {};
        tags['Name'] = config.clusterName;
        tags['berlioz:cluster'] = config.clusterName;

        var params = {
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: _.keys(tags).map(x => ({ Key: x, Value: tags[x]}))
                }
            ]
        }
        params.ImageId = config.imageId;
        params.InstanceType = config.instanceType;
        params.Placement = {
                AvailabilityZone: config.zone
            };
        params.KeyName = config.keyName;
        params.NetworkInterfaces = [
                {
                    DeviceIndex: 0,
                    AssociatePublicIpAddress: true,
                    SubnetId: config.subnetId,
                    Groups: [ config.securityGroupId ]
                }
            ];
        params.IamInstanceProfile = {
                Name: config.iamInstanceProfile
            };
        params.UserData = new Buffer(config.userData).toString('base64');

        this.logger.info('Creating Instance...%s', '', params);
        return this._ec2.runInstances(params).promise()
            .then(data => {
                this.logger.info('Run Instance Result%s', '', data);
                var instance = data.Instances[0];
                return instance;
            })
            .then(instance => {
                if (waitStabilize) {
                    return this.waitInstanceStable(instance.InstanceId, instance)
                }
                return instance;
            });
    }

    terminate(instanceId)
    {
        var params = {
            InstanceIds: [
                instanceId
            ]
        }

        this.logger.info('Terminating Instance %s...', instanceId);
        return this._ec2.terminateInstances(params).promise()
            .then(data => {
                this.logger.info('Terminating Instance Result%s', '', data);
                // var instance = data.Instances[0];
                // return instance;
            })
            .then(() => this.query(instanceId))
            .then(instance => this.waitInstanceStable(instanceId, instance));
    }

    waitInstanceStable(instanceId, instance)
    {
        if (this._isInstanceStable(instance)) {
            this.logger.info('Instance %s is stable', instanceId);
            return instance;
        }

        this.logger.info('Waiting Instance %s to be stable...', instanceId);
        return Promise.timeout(5000)
            .then(() => this.query(instanceId))
            .then(newInstance => this.waitInstanceStable(instanceId, newInstance));
    }

    _isInstanceStable(instance)
    {
        if (!instance) {
            return true;
        }

        if (instance.State.Name == 'pending' || instance.State.Name == 'shutting-down' || instance.State.Name == 'stopping')
        {
            return false;
        }

        if (instance.State.Name == 'terminated' || instance.State.Name == 'stopped')
        {
            return true;
        }

        if (instance.BlockDeviceMappings.length == 0) {
            return false;
        }

        for(var volume of instance.BlockDeviceMappings) {
            if (volume.Ebs.Status == 'attaching') {
                return false;
            }
        }

        for(var ni of instance.NetworkInterfaces) {
            if (ni.Attachment.Status == 'attaching') {
                return false;
            }
        }

        return true;
    }

}

module.exports = AWSInstanceClient;
