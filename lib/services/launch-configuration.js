const _ = require('lodash');

class AWSLaunchConfigurationClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._autoscaling = parent._autoscaling;
    }

    createForCluster(sgId, cluster, config)
    {
        var params = {
            AssociatePublicIpAddress: config.AssociatePublicIpAddress,
            IamInstanceProfile: config.iamInstanceProfile,
            ImageId: config.image,
            InstanceType: config.instanceType,
            LaunchConfigurationName: cluster,
            SecurityGroups: [
               sgId
           ],
           KeyName: config.keyName
        };
        if (config.userData) {
            params.UserData = new Buffer(config.userData).toString('base64');
        }
        this.logger.info('Creating LaunchConfiguration %s...', params.LaunchConfigurationName);
        this.logger.verbose('Creating LaunchConfiguration... %s', '', params);
        return this._autoscaling.createLaunchConfiguration(params).promise()
            .then(result => {
                this.logger.verbose('LaunchConfiguration created %s', '', result);
                return this.query(cluster);
            });
    }

    query(name) {
        if (!name) {
            throw new Error('LaunchConfiguration::Query. Invalid name:' + name);
        }
        var params = {
            LaunchConfigurationNames: [
                name
            ]
        };
        return this._autoscaling.describeLaunchConfigurations(params).promise()
            .then(result => {
                if (result.LaunchConfigurations.length > 0) {
                    var lc = result.LaunchConfigurations[0];
                    return lc;
                }
                else {
                    return null;
                }
            });
    }

    queryAll(cluster) {
        var params = {
            LaunchConfigurationNames: [
                cluster
            ]
        };
        return this._autoscaling.describeLaunchConfigurations(params).promise()
            .then(result => {
                return result.LaunchConfigurations;
            });
    }

    delete(lcId) {
        var params = {
            LaunchConfigurationName: lcId
        };
        this.logger.info('Deleting LaunchConfiguration %s...', lcId);
        return this._autoscaling.deleteLaunchConfiguration(params).promise()
            .then(result => {
                return null;
            });
    }
}

module.exports = AWSLaunchConfigurationClient;
