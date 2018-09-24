const _ = require('the-lodash');

class AWSLaunchConfigurationClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._autoscaling = parent.getAwsService('autoscaling');
    }

    create(sgId, name, config)
    {
        var params = {
            AssociatePublicIpAddress: config.AssociatePublicIpAddress,
            IamInstanceProfile: config.IamInstanceProfile,
            ImageId: config.image,
            InstanceType: config.instanceType,
            LaunchConfigurationName: name,
            SecurityGroups: [
               sgId
           ],
           KeyName: config.KeyName
        };
        if (config.userData) {
            params.UserData = new Buffer(config.userData).toString('base64');
        }
        this.logger.info('Creating LaunchConfiguration %s...', params.LaunchConfigurationName);
        this.logger.verbose('Creating LaunchConfiguration... %s', '', params);
        return this._autoscaling.createLaunchConfiguration(params)
            .then(result => {
                this.logger.verbose('LaunchConfiguration created %s', '', result);
                return this.query(name);
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
        return this._autoscaling.describeLaunchConfigurations(params)
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

    queryAll(prefix, nextToken, results) {
        if (!results) {
            results = [];
        }
        var params = {
        };
        if (nextToken) {
            params.NextToken = nextToken
        }
        return this._autoscaling.describeLaunchConfigurations(params)
            .then(result => {
                for (var x of result.LaunchConfigurations) {
                    if (prefix) {
                        if (!_.startsWith(x.LaunchConfigurationName, prefix)) {
                            continue;
                        }
                    }
                    results.push(x);
                }
                if (result.NextToken) {
                    return this.queryAll(prefix, result.NextToken, results);
                } else {
                    return results;
                }
            });
    }

    delete(lcId) {
        var params = {
            LaunchConfigurationName: lcId
        };
        this.logger.info('Deleting LaunchConfiguration %s...', lcId);
        return this._autoscaling.deleteLaunchConfiguration(params)
            .then(result => {
                return null;
            });
    }
}

module.exports = AWSLaunchConfigurationClient;
