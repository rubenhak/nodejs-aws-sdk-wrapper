const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSAutoScalingGroupClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._autoscaling = parent.getAwsService('autoscaling');
    }

    create(name, lcName, subnetIds, zones, tags)
    {
        var params = {
            AutoScalingGroupName: name,
            LaunchConfigurationName: lcName,
            MinSize: 0,
            MaxSize: 0,
            DesiredCapacity: 0,
            VPCZoneIdentifier: subnetIds.join(),
            AvailabilityZones: zones
        };
        params.Tags = _.keys(tags).map(x => ({
            Key: x,
            Value: tags[x],
            ResourceType: 'auto-scaling-group',
            ResourceId: name,
            PropagateAtLaunch: true
        }));
        this.logger.info('Creating AutoScalingGroup %s...', name);
        this.logger.verbose('Creating AutoScalingGroup...', params);
        return this._autoscaling.createAutoScalingGroup(params)
            .then(result => {
                this.logger.verbose('AutoScalingGroup created. ', result);
                return this.query(name);
            });
    }

    query(name) {
        if (!name) {
            throw new Error('AutoScalingGroup::Query. Invalid name:' + name);
        }
        var params = {
            AutoScalingGroupNames: [
                name
            ]
        };
        return this._autoscaling.describeAutoScalingGroups(params)
            .then(result => {
                if (result.AutoScalingGroups.length > 0) {
                    var asg = result.AutoScalingGroups[0];
                    return asg;
                }
                else {
                    return null;
                }
            });
    }

    queryAll(tags, nextToken, results) {
        if (!results) {
            results = [];
        }
        var params = {
            NextToken: nextToken
        };
        return this._autoscaling.describeAutoScalingGroups(params)
            .then(data => {
                for(var asg of data.AutoScalingGroups) {
                    if  ((!tags) || (_.keys(tags).every(x => {
                        return this.parent.getObjectTag(asg, x) == tags[x];
                    }))) {
                        results.push(asg);
                    }
                }
                if (data.NextToken) {
                    return this.queryAll(tags, data.NextToken, results);
                }
                return results;
            });
    }

    attachInstance(asgId, instanceId)
    {
        return this.query(asgId)
            .then(asg => {
                this.logger.info('AutoScalingGroup: %s...', '', asg);
                if (asg.MaxSize < asg.DesiredCapacity + 1) {
                    return this.updateMax(asgId, asg.DesiredCapacity + 1);
                }
            })
            .then(() => {
                var params = {
                    AutoScalingGroupName: asgId,
                    InstanceIds: [ instanceId ]
                };
                this.logger.info('AutoScalingGroup Attaching instance %s...', instanceId);
                return this._autoscaling.attachInstances(params)
                    .then(result => {
                        this.logger.info('AutoScalingGroup instance attach result%s', '', result);
                        return result;
                    });
            })
    }

    updateMax(asgId, max)
    {
        var params = {
            AutoScalingGroupName: asgId,
            MaxSize: max
        };
        this.logger.info('AutoScalingGroup %s updating Max=%s...', asgId, max);
        return this._autoscaling.updateAutoScalingGroup(params)
            .then(result => {
                this.logger.info('AutoScalingGroup max update done.');
            });
    }

    setupScale(asg, min, desired, max)
    {
        var params = {
            AutoScalingGroupName: asg.AutoScalingGroupName,
            MinSize: min,
            MaxSize: max,
            DesiredCapacity: desired
        };
        this.logger.info('AutoScalingGroup Scale Setup. Desired=%s...', desired);
        return this._autoscaling.updateAutoScalingGroup(params)
            .then(() => this.query(asg.AutoScalingGroupName))
            .then(asg => {
                this.logger.info('AutoScalingGroup Scale Setup Done');
                return asg;
            });
    }

    update(asg, config)
    {
        var params = _.clone(config);
        params.AutoScalingGroupName = asg.AutoScalingGroupName;
        this.logger.info('AutoScalingGroup Update...%s', '', params);
        return this._autoscaling.updateAutoScalingGroup(params)
            .then(result => {
                this.logger.info('AutoScalingGroup Update Done%s', '', result);
                return result;
            });
    }

    delete(asgId) {
        var params = {
            AutoScalingGroupName: asgId,
            ForceDelete: true
        };
        this.logger.info('Deleting AutoScalingGroup %s...', asgId);
        return this._autoscaling.deleteAutoScalingGroup(params)
            .then(result => {
                this.logger.info('AutoScalingGroup %s Delete Result', asgId, result);
                return this._waitDeleted(asgId);
            });
    }

    _waitDeleted(asgId)
    {
        this.logger.info('Waiting AutoScalingGroup %s to be deleted...', asgId);
        return this.query(asgId)
            .then(result => {
                if (!result) {
                    return;
                }
                return Promise.timeout(5000)
                    .then(() => this._waitDeleted(asgId));
            });
    }

}

module.exports = AWSAutoScalingGroupClient;
