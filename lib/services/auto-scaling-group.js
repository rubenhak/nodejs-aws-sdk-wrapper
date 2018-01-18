const Promise = require('the-promise');
const _ = require('lodash');

class AWSAutoScalingGroupClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._autoscaling = parent._autoscaling;
        this._ecs = parent._ecs;
    }

    // fetchForCluster(createIfNotPresent, lc, subnet, cluster)
    // {
    //     this._logger.verbose('Fetching AutoScalingGroup %s...', cluster);
    //
    //     return this.query(cluster)
    //         .then(result => {
    //             if (!createIfNotPresent || result) {
    //                 return result;
    //             } else {
    //                 return this.createForCluster(lc, subnet.SubnetId, cluster);
    //             }
    //         })
    //         .then(result => {
    //             this._logger.debug('Fetched AutoScalingGroup. %s', '', result);
    //             return result;
    //         });
    // }

    createForCluster(lc, subnetIds, zones, cluster, zone)
    {
        var name = cluster + '_' + zone;
        var params = {
            AutoScalingGroupName: name,
            LaunchConfigurationName: lc,
            MinSize: 0,
            MaxSize: 0,
            DesiredCapacity: 0,
            VPCZoneIdentifier: subnetIds.join(),
            AvailabilityZones: zones,
            Tags: [
                {
                    Key: 'Name',
                    Value: cluster + '-' + zone,
                    ResourceType: 'auto-scaling-group',
                    ResourceId: name,
                    PropagateAtLaunch: true
                },
                {
                    Key: 'berlioz:cluster',
                    Value: cluster,
                    ResourceType: 'auto-scaling-group',
                    ResourceId: name,
                    PropagateAtLaunch: true
                },
                {
                    Key: 'berlioz:zone',
                    Value: zone,
                    ResourceType: 'auto-scaling-group',
                    ResourceId: name,
                    PropagateAtLaunch: true
                }
            ]
        };
        this._logger.info('Creating AutoScalingGroup %s...', cluster);
        this._logger.verbose('Creating AutoScalingGroup... %s', '', params);
        return this._autoscaling.createAutoScalingGroup(params).promise()
            .then(result => {
                this._logger.verbose('AutoScalingGroup created %s', '', result);
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
        return this._autoscaling.describeAutoScalingGroups(params).promise()
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

    queryAll(cluster, nextToken, results) {
        if (!results) {
            results = [];
        }
        var params = {
            NextToken: nextToken
        };
        return this._autoscaling.describeAutoScalingGroups(params).promise()
            .then(data => {
                for(var asg of data.AutoScalingGroups) {
                    if (this._parent.getObjectTag(asg, 'berlioz:cluster') == cluster) {
                        results.push(asg);
                    }
                }
                if (data.NextToken) {
                    return this.queryAll(cluster, data.NextToken, results);
                }
                return results;
            });
    }

    attachInstance(asgId, instanceId)
    {
        return this.query(asgId)
            .then(asg => {
                this._logger.info('AutoScalingGroup: %s...', '', asg);
                if (asg.MaxSize < asg.DesiredCapacity + 1) {
                    return this.updateMax(asgId, asg.DesiredCapacity + 1);
                }
            })
            .then(() => {
                var params = {
                    AutoScalingGroupName: asgId,
                    InstanceIds: [ instanceId ]
                };
                this._logger.info('AutoScalingGroup Attaching instance %s...', instanceId);
                return this._autoscaling.attachInstances(params).promise()
                    .then(result => {
                        this._logger.info('AutoScalingGroup instance attach result%s', '', result);
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
        this._logger.info('AutoScalingGroup %s updating Max=%s...', asgId, max);
        return this._autoscaling.updateAutoScalingGroup(params).promise()
            .then(result => {
                this._logger.info('AutoScalingGroup max update done.');
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
        this._logger.info('AutoScalingGroup Scale Setup. Desired=%s...', desired);
        return this._autoscaling.updateAutoScalingGroup(params).promise()
            // .then(result => {
            //     return this._waitAutoScalingGroupStabilize(asg.AutoScalingGroupName, desired);
            // })
            .then(() => this.query(asg.AutoScalingGroupName))
            .then(asg => {
                this._logger.info('AutoScalingGroup Scale Setup Done');
                return asg;
            });
    }

    update(asg, config)
    {
        var params = _.clone(config);
        params.AutoScalingGroupName = asg.AutoScalingGroupName;
        this._logger.info('AutoScalingGroup Update...%s', '', params);
        return this._autoscaling.updateAutoScalingGroup(params).promise()
            .then(result => {
                this._logger.info('AutoScalingGroup Update Done%s', '', result);
                return result;
            });
    }

    delete(asgId) {
        var params = {
            AutoScalingGroupName: asgId,
            ForceDelete: true
        };
        this._logger.info('Deleting AutoScalingGroup %s...', asgId);
        return this._autoscaling.deleteAutoScalingGroup(params).promise()
            .then(result => {
                this._logger.info('AutoScalingGroup %s Delete Result', asgId, result);
                return this._waitDeleted(asgId);
            });
    }

    _waitDeleted(asgId)
    {
        this._logger.info('Waiting AutoScalingGroup %s to be deleted...', asgId);
        return this.query(asgId)
            .then(result => {
                if (!result) {
                    return;
                }
                return Promise.timeout(5000)
                    .then(() => this._waitDeleted(asgId));
            });
    }

    _waitAutoScalingGroupStabilize(asgName, capacity) {
        this._logger.info('AutoScalingGroup %s stabilizing...', asgName);
        return new Promise((resolve, reject) => {
            this._waitAutoScalingGroupStabilizeX(resolve, reject, asgName, capacity);
        });
    }

    _waitAutoScalingGroupStabilizeX(resolve, reject, asgName, capacity) {
        try {
            this.query(asgName)
            .then(data => {
                this._logger.info('AutoScalingGroup %s stabilizing...', asgName, data);
                if (!data)
                {
                    reject('Could not get AutoScalingGroup');
                    return;
                }
                if (data.DesiredCapacity != capacity) {
                    reject('Failed to set desired capacity.');
                    return;
                }

                var clusterName = this._parent.getObjectTag(data, 'berlioz:cluster');
                this._logger.info('AutoScalingGroup %s cluster=%s', asgName, clusterName);

                this._logger.info(`AutoScalingGroup %s stabilizing. Desired=%s. Actual=%s.`, asgName, data.DesiredCapacity, data.Instances.length);
                if (data.DesiredCapacity == data.Instances.length) {

                    if (_.every(data.Instances, x => {
                            return x.LifecycleState == 'InService' &&
                            x.HealthStatus == 'Healthy'
                        }))
                    {
                        this._ecs.listContainerInstances({ cluster: clusterName }).promise()
                            .then(ciData => {
                                if (ciData.containerInstanceArns.length !== capacity)
                                {
                                    this._logger.info(`AutoScalingGroup. Waiting for container instances...`);
                                    setTimeout( () => {
                                        this._waitAutoScalingGroupStabilizeX(resolve, reject, asgName, capacity);
                                    }, 5000);
                                }
                                else
                                {
                                    this._logger.info(`AutoScalingGroup. Stabilized.`);
                                    return this._waitContainerInstancesStabilize(clusterName)
                                        .then(x => {
                                            resolve(data);
                                        })
                                        .catch(reject);
                                }
                            })
                            .catch(reject);

                        return;
                    } else {
                        this._logger.info(`AutoScalingGroup. Waiting for instances...`);
                    }
                } else {
                    this._logger.info(`AutoScalingGroup. Waiting for cluster...`);
                }

                setTimeout( () => {
                    this._waitAutoScalingGroupStabilizeX(resolve, reject, asgName, capacity);
                }, 5000);
            })
            .catch(reject);
        } catch (e) {
            reject(e);
        }

    }

    _waitContainerInstancesStabilize(asgName) {
        this._logger.info(`AutoScalingGroup. Stabilizing Container Instances...`);
        return new Promise((resolve, reject) => {
            this._waitContainerInstancesStabilizeX(resolve, reject, asgName);
        });
    }

    _waitContainerInstancesStabilizeX(resolve, reject, asgName) {
        try {
            this._logger.info(`WaitContainerInstances ...`);
            this._ecs.listContainerInstances({ cluster: asgName }).promise()
            .then(data => {
                return Promise.parallel(data.containerInstanceArns, arn => {
                    return this._fetchContainerInstance(arn, asgName)
                        .then(ci => {
                            return ci.status == 'ACTIVE';
                        });
                });
            })
            .then(data => {
                if (_.every(data, x => x)) {
                    resolve(true);
                    return;
                } else {
                    setTimeout( () => {
                        this._waitContainerInstancesStabilizeX(resolve, reject, asgName);
                    }, 5000);
                }
            })
            .catch(reject);
        } catch (e) {
            reject(e);
        }
    }

    _fetchContainerInstance(arn, clusterName) {
        return this._ecs.describeContainerInstances({ cluster: clusterName, containerInstances: [arn] }).promise()
            .then(data => {
                var ci = data.containerInstances[0];
                return ci;
            })
    }
}

module.exports = AWSAutoScalingGroupClient;
