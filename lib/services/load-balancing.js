const Promise = require('the-promise');
const _ = require('lodash');

class AWSLoadBalancingClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._elb = parent._elb;
    }

    createTargetGroup(config, vpcId, cluster, service, name)
    {
        var params = _.clone(config);
        params.Name = cluster + '-' + service + '-' + name;
        params.VpcId = vpcId;
        this.logger.info('Creating TargetGroup %s::%s...', cluster, service);
        this.logger.verbose('Creating TargetGroup... %s', '', params);
        var arn = null;
        return this._elb.createTargetGroup(params).promise()
            .then(result => {
                var tg = result.TargetGroups[0];
                arn = tg.TargetGroupArn;
                this.logger.verbose('TargetGroup created %s', '', tg);
                return this._setupTags(arn, tg,
                    {
                        'berlioz:cluster': cluster,
                        'berlioz:service': service,
                        'berlioz:endpoint': name
                    });
            })
            .then(() => this.queryTargetGroup(arn));
    }

    queryTargetGroup(arn)
    {
        var params = {
            TargetGroupArns: [arn]
        };
        this.logger.verbose('Querying TargetGroup %s...', arn);
        return this._elb.describeTargetGroups(params).promise()
            .then(result => {
                if (result.TargetGroups.length == 0) {
                    return null;
                }
                var tg = result.TargetGroups[0];
                return this._queryTags(tg.TargetGroupArn, tg);
            });
    }

    deleteTargetGroup(obj)
    {
        var params = {
            TargetGroupArn: obj.TargetGroupArn
        };
        this.logger.info('Deleting TargetGroup %s...', obj.TargetGroupArn);
        this.logger.verbose('Deleting TargetGroup... %s', '', params);
        return this._elb.deleteTargetGroup(params).promise()
            .then(result => {
            });
    }

    queryAllTargetGroups(cluster, marker, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Marker: marker
        };
        this.logger.verbose('Querying TargetGroups for %s...', cluster);
        return this._elb.describeTargetGroups(params).promise()
            .then(result => {
                return Promise.serial(result.TargetGroups, x => this._queryTags(x.TargetGroupArn, x))
                    .then(objects => {
                        for(var x of objects) {
                            if (this.parent.getObjectTag(x, 'berlioz:cluster') == cluster) {
                                results.push(x);
                            }
                        }
                        if (result.NextMarker) {
                            return this.queryAllTargetGroups(cluster, result.NextMarker, results);
                        } else {
                            return results;
                        }
                    });
            });
    }

    /* LOAD BALANCER */

    queryAllLoadBalancers(cluster, marker, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Marker: marker
        };
        this.logger.verbose('Querying LoadBalancers for %s...', cluster);
        return this._elb.describeLoadBalancers(params).promise()
            .then(result => {
                return Promise.serial(result.LoadBalancers , x => this._getLoadBalancerExtras(x))
                    .then(objects => {
                        for(var x of objects) {
                            if (this.parent.getObjectTag(x, 'berlioz:cluster') == cluster) {
                                results.push(x);
                            }
                        }
                        if (result.NextMarker) {
                            return this.queryAllLoadBalancers(cluster, result.NextMarker, results);
                        } else {
                            return results;
                        }
                    });
            });
    }

    queryLoadBalancer(arn)
    {
        var params = {
            LoadBalancerArns: [arn]
        };
        this.logger.verbose('Querying LoadBalancer %s...', arn);
        return this._elb.describeLoadBalancers(params).promise()
            .then(result => {
                if (result.LoadBalancers.length == 0) {
                    return null;
                }
                var lb = result.LoadBalancers[0];
                return this._getLoadBalancerExtras(lb);
            })
            .catch(error => {
                this.logger.warn('There was error querying LoadBalancer: %s. It might have been deleted.', arn, error);
                // this.logger.exception(error);
                return null;
            });
    }

    _getLoadBalancerExtras(lb)
    {
        var lbWithTags = null;
        return this._queryTags(lb.LoadBalancerArn, lb)
            .then(newLb => {
                lbWithTags = newLb;
                return this.queryAllListeners(lb.LoadBalancerArn);
            })
            .then(listeners => {
                lbWithTags.Listeners = listeners;
                return lbWithTags;
            });
    }


    createLoadBalancer(config, cluster, service, name, securityGroups, subnets)
    {
        var params = _.clone(config);
        params.Name = cluster + '-' + service + '-' + name;
        params.SecurityGroups = securityGroups;
        params.Subnets = subnets;
        params.Tags = this.parent.toTagArray({
            'berlioz:cluster': cluster,
            'berlioz:service': service,
            'berlioz:endpoint': name
        });

        this.logger.info('Creating LoadBalancer %s::%s::%s...', cluster, service, name);
        this.logger.verbose('Creating LoadBalancer... %s', '', params);
        return this._elb.createLoadBalancer(params).promise()
            .then(result => {
                var lb = result.LoadBalancers[0];
                this.logger.verbose('LoadBalancer created %s', '', lb);
                return this.queryLoadBalancer(lb.LoadBalancerArn);
            });
    }

    modifySecurityGroups(arn, securityGroups)
    {
        var params = {
            LoadBalancerArn: arn,
            SecurityGroups: securityGroups
        }
        this.logger.info('Setting LoadBalancer %s security groups...', arn);
        this.logger.verbose('Setting LoadBalancer %s security groups...', arn, params);
        return this._elb.setSecurityGroups(params).promise()
            .then(result => {
            });
    }

    deleteLoadBalancer(arn)
    {
        var params = {
            LoadBalancerArn: arn
        };
        this.logger.info('Deleting LoadBalancer %s...', arn);
        this.logger.verbose('Deleting LoadBalancer .. %s', '', params);
        return this._elb.deleteLoadBalancer(params).promise()
            .then(result => {
                this.logger.verbose('Load Balancer deleted %s', '', result);
                return this._waitLoadBalancerDelete(arn);
            })
            .then(() => {
                this.logger.info('Load Balancer %s is deleted ', arn);
            })
            ;
    }

    _waitLoadBalancerDelete(arn)
    {
        this.logger.verbose('Waiting LoadBalancer delete %s', arn);

        return Promise.timeout(2000)
            .then(() => this.queryLoadBalancer(arn))
            .then(lb => {
                if (lb) {
                    this.logger.verbose('LoadBalancer is still present %s', '', lb);
                    return this._waitLoadBalancerDelete(arn);
                }
            });

    }

    /* LISTENERS */

    queryAllListeners(lbArn, marker, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            LoadBalancerArn: lbArn,
            Marker: marker
        };
        this.logger.verbose('Querying LoadBalancer Listeners for %s...', lbArn);
        return this._elb.describeListeners(params).promise()
            .then(result => {
                for (var x of result.Listeners) {
                    results.push(x);
                }
                if (result.NextMarker) {
                    return this.queryAllListeners(lbArn, result.NextMarker, results);
                } else {
                    return results;
                }
            });
    }

    createListener(loadBalancerArn, targetGroupArn, config)
    {
        var params = _.clone(config);
        params.DefaultActions = [
            {
                TargetGroupArn: targetGroupArn,
                Type: 'forward'
            }
        ];
        params.LoadBalancerArn = loadBalancerArn;

        this.logger.info('Creating LoadBalancer Listener %s => %s...', loadBalancerArn, targetGroupArn);
        this.logger.verbose('Creating LoadBalancer Listener... %s', '', params);
        return this._elb.createListener(params).promise()
            .then(result => {
                var listener = result.Listeners[0];
                this.logger.verbose('Listener created %s', '', listener);
                return listener;
            });
    }

    deleteListener(arn)
    {
        var params = {
            ListenerArn: arn
        };
        this.logger.info('Deleting LoadBalancer Listener %s...', arn);
        this.logger.verbose('Deleting LoadBalancer Listener... %s', '', params);
        return this._elb.deleteListener(params).promise()
            .then(result => {
                this.logger.verbose('Listener deleted %s', '', result);
            });
    }

    /* Targets */
    queryTargetHealth(targetGroupArn)
    {
        var params = {
            TargetGroupArn: targetGroupArn
        };
        this.logger.verbose('Querying Target Health for %s...', targetGroupArn);
        return this._elb.describeTargetHealth(params).promise()
            .then(result => {
                var targets = {
                    TargetGroupArn: targetGroupArn,
                    Targets: result.TargetHealthDescriptions
                }
                this.logger.verbose('Targets for %s', targetGroupArn, targets);
                return targets;
            });
    }

    registerTargetGroupMember(targetGroupArn, instanceId, port)
    {
        var params = {
            TargetGroupArn: targetGroupArn,
            Targets: [
                {
                    Id: instanceId,
                    Port: port
                }
            ]
        };
        this.logger.verbose('Registering Target Group Member for %s...', targetGroupArn);
        this.logger.verbose('Registering Target Group Member for %s...', targetGroupArn, params);
        return this._elb.registerTargets(params).promise()
            .then(result => {
                this.logger.verbose('Target Group Member registered %s', '', result);
            });
    }

    deregisterTargetGroupMember(targetGroupArn, instanceId, port)
    {
        var params = {
            TargetGroupArn: targetGroupArn,
            Targets: [
                {
                    Id: instanceId,
                    Port: port
                }
            ]
        };
        this.logger.verbose('Deregistering Target Group Member for %s...', targetGroupArn);
        this.logger.verbose('Deregistering Target Group Member for %s...', targetGroupArn, params);
        return this._elb.deregisterTargets(params).promise()
            .then(result => {
                this.logger.verbose('Target Group Member deregistered %s', '', result);
            });
    }

    /*******************************************/

    _queryTags(arn, obj)
    {
        var params = {
            ResourceArns: [arn]
        };
        this.logger.silly('Querying obj tags %s...', arn);
        return this._elb.describeTags(params).promise()
            .then(result => {
                if (result.TagDescriptions.length == 0) {
                    return null;
                }
                var tags = result.TagDescriptions[0].Tags;
                obj.Tags = tags;
                return obj;
            });
    }

    _setupTags(arn, obj, newTags) {
        var tags = [];
        var params = {
            ResourceArns: [arn],
            Tags: tags
        };

        for(var tagName of _.keys(newTags)) {
            var tagValue = newTags[tagName];
            if (this.parent.getObjectTag(obj, tagName) != tagValue) {
                tags.push({
                    Key: tagName,
                    Value: tagValue
                });
            }
        }

        if (tags.length == 0) {
            return Promise.resolve();
        }

        return this._elb.addTags(params).promise()
            .then(result => {
                this.logger.verbose('Tags created %s', '', result);
            });
    }
}

module.exports = AWSLoadBalancingClient;
