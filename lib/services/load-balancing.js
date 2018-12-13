const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSLoadBalancingClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._elb = parent.getAwsService('elbv2');
    }

    createTargetGroup(config, vpcId, name, tags)
    {
        var params = _.clone(config);
        params.Name = name;
        params.VpcId = vpcId;
        this.logger.info('Creating TargetGroup %s...', name);
        this.logger.verbose('Creating TargetGroup... %s', '', params);
        var arn = null;
        return this._elb.createTargetGroup(params)
            .then(result => {
                var tg = result.TargetGroups[0];
                arn = tg.TargetGroupArn;
                this.logger.verbose('TargetGroup created %s', '', tg);
                return this._setupTags(arn, tg, tags);
            })
            .then(() => this.queryTargetGroup(arn));
    }

    queryTargetGroup(arn)
    {
        var params = {
            TargetGroupArns: [arn]
        };
        this.logger.verbose('Querying TargetGroup %s...', arn);
        return this._elb.describeTargetGroups(params)
            .then(result => {
                if (result.TargetGroups.length == 0) {
                    return null;
                }
                var tg = result.TargetGroups[0];
                return this._queryTags(tg.TargetGroupArn, tg);
            })
            .catch(reason => {
                if (reason.code == 'TargetGroupNotFound') {
                    return null;
                }
                throw reason;
            });
    }

    deleteTargetGroup(obj)
    {
        var params = {
            TargetGroupArn: obj.TargetGroupArn
        };
        this.logger.info('Deleting TargetGroup %s...', obj.TargetGroupArn);
        this.logger.verbose('Deleting TargetGroup... %s', '', params);
        return this._elb.deleteTargetGroup(params)
            .then(result => {
            });
    }

    queryAllTargetGroups(tags, marker, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Marker: marker
        };
        this.logger.verbose('Querying TargetGroups...', tags);
        return this._elb.describeTargetGroups(params)
            .then(result => {
                return Promise.serial(result.TargetGroups, x => this._queryTags(x.TargetGroupArn, x))
                    .then(objects => {
                        for(var tg of objects) {
                            if (tg) {
                                if  ((!tags) || (_.keys(tags).every(x => {
                                    return this.parent.getObjectTag(tg, x) == tags[x];
                                }))) {
                                    results.push(tg);
                                }
                            }
                        }
                        if (result.NextMarker) {
                            return this.queryAllTargetGroups(tags, result.NextMarker, results);
                        } else {
                            return results;
                        }
                    });
            });
    }

    /* LOAD BALANCER */

    queryAllLoadBalancers(tags, marker, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Marker: marker
        };
        this.logger.verbose('Querying LoadBalancers...', tags);
        return this._elb.describeLoadBalancers(params)
            .then(result => {
                return Promise.serial(result.LoadBalancers , x => this._getLoadBalancerExtras(x))
                    .then(objects => {
                        for(var lb of objects) {
                            if (lb) {
                                if  ((!tags) || (_.keys(tags).every(x => {
                                    return this.parent.getObjectTag(lb, x) == tags[x];
                                }))) {
                                    results.push(lb);
                                }
                            }
                        }
                        if (result.NextMarker) {
                            return this.queryAllLoadBalancers(tags, result.NextMarker, results);
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
        return this._elb.describeLoadBalancers(params)
            .then(result => {
                if (result.LoadBalancers.length == 0) {
                    return null;
                }
                var lb = result.LoadBalancers[0];
                return this._getLoadBalancerExtras(lb);
            })
            .catch(error => {
                if (error.code == 'LoadBalancerNotFound') {
                    return null;
                } else {
                    throw error;
                }
            });
    }

    _getLoadBalancerExtras(lb)
    {
        var lbWithTags = null;
        return this._queryTags(lb.LoadBalancerArn, lb)
            .then(newLb => {
                if (newLb) {
                    lbWithTags = newLb;
                    return this.queryAllListeners(lb.LoadBalancerArn);
                } else {
                    return null;
                }
            })
            .then(listeners => {
                if (_.isNullOrUndefined(listeners)) {
                    return null;
                }
                lbWithTags.Listeners = listeners;
                return lbWithTags;
            });
    }

    createLoadBalancer(name, config, tags, securityGroups, subnets)
    {
        var params = _.clone(config);
        params.Name = name;
        params.SecurityGroups = securityGroups;
        params.Subnets = subnets;
        params.Tags = this.parent.toTagArray(tags);

        this.logger.info('Creating LoadBalancer %s...', name);
        this.logger.verbose('Creating LoadBalancer... %s', '', params);
        return this._elb.createLoadBalancer(params)
            .then(result => {
                var lb = result.LoadBalancers[0];
                this.logger.verbose('LoadBalancer created', lb);
                return this.queryLoadBalancer(lb.LoadBalancerArn);
            });
    }

    waitStabilize(arn)
    {
        return this.queryLoadBalancer(arn)
            .then(obj => {
                if (!obj) {
                    return null;
                }
                if (obj.State.Code == 'provisioning') {
                    this.logger.info('Waiting LoadBalancer %s to provision...', arn);
                    return Promise.timeout(5000)
                        .then(() => this.waitStabilize(arn));
                }
                return obj;
            })
    }

    modifySecurityGroups(arn, securityGroups)
    {
        var params = {
            LoadBalancerArn: arn,
            SecurityGroups: securityGroups
        }
        this.logger.info('Setting LoadBalancer %s security groups...', arn);
        this.logger.verbose('Setting LoadBalancer %s security groups...', arn, params);
        return this._elb.setSecurityGroups(params)
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
        return this._elb.deleteLoadBalancer(params)
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
        return this._elb.describeListeners(params)
            .then(result => {
                for (var x of result.Listeners) {
                    results.push(x);
                }
                if (result.NextMarker) {
                    return this.queryAllListeners(lbArn, result.NextMarker, results);
                } else {
                    return results;
                }
            })
            .catch(reason => {
                if (reason.code == 'LoadBalancerNotFound') {
                    return null;
                }
                throw reason;
            });
    }

    createListener(loadBalancerArn, config)
    {
        var params = _.clone(config);
        params.LoadBalancerArn = loadBalancerArn;

        this.logger.info('Creating LoadBalancer Listener %s => %s...', loadBalancerArn);
        this.logger.verbose('Creating LoadBalancer Listener... %s', '', params);
        return this._elb.createListener(params)
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
        return this._elb.deleteListener(params)
            .then(result => {
                this.logger.verbose('Listener deleted %s', '', result);
            });
    }

    /* Listener Rules */
    queryListenerRules(listenerArn, marker, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            ListenerArn: listenerArn
        };
        this.logger.verbose('Querying Listener Rules...');
        return this._elb.describeRules(params)
            .then(result => {
                if (result.Rules) {
                    results = _.concat(results, result.Rules);
                }

                if (result.NextMarker) {
                    return this.queryListenerRules(listenerArn, result.NextMarker, results);
                } else {
                    return results;
                }
            });
    }

    queryListenerRule(ruleArn)
    {
        var params = {
            RuleArns: [ruleArn]
        };
        this.logger.verbose('Querying Listener Rule...');
        return this._elb.describeRules(params)
            .then(result => {
                if (result.Rules) {
                    if (result.Rules.length > 0) {
                        return result.Rules[0];
                    }
                }
                return null;
            });
    }

    deleteListenerRule(ruleArn)
    {
        var params = {
            RuleArn: ruleArn
        };
        this.logger.verbose('Deleting Listener Rule...');
        return this._elb.deleteRule(params)
            .then(result => {
                return null;
            });
    }

    createListenerRule(listenerArn, priority, config)
    {
        var params = _.clone(config);
        params.ListenerArn = listenerArn;
        params.Priority = priority;
        this.logger.verbose('Creating Listener Rule...');
        return this._elb.createRule(params)
            .then(result => {
                if (result.Rules) {
                    if (result.Rules.length > 0) {
                        return result.Rules[0];
                    }
                }
                return null;
            });
    }

    modifyListenerRule(ruleArn, config)
    {
        var params = _.clone(config);
        params.RuleArn = ruleArn;
        this.logger.verbose('Updating Listener Rule...');
        return this._elb.modifyRule(params)
            .then(result => {
                if (result.Rules) {
                    if (result.Rules.length > 0) {
                        return result.Rules[0];
                    }
                }
                return null;
            });
    }

    /* Targets */
    queryTargetHealth(targetGroupArn)
    {
        var params = {
            TargetGroupArn: targetGroupArn
        };
        this.logger.verbose('Querying Target Health for %s...', targetGroupArn);
        return this._elb.describeTargetHealth(params)
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
        return this._elb.registerTargets(params)
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
        return this._elb.deregisterTargets(params)
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
        return this._elb.describeTags(params)
            .then(result => {
                if (result.TagDescriptions.length == 0) {
                    return obj;
                }
                var tags = result.TagDescriptions[0].Tags;
                obj.Tags = tags;
                return obj;
            })
            .catch(reason => {
                if (reason.code == 'LoadBalancerNotFound') {
                    return null;
                }
                if (reason.code == 'TargetGroupNotFound') {
                    return null;
                }
                throw reason;
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

        return this._elb.addTags(params)
            .then(result => {
                this.logger.verbose('Tags created %s', '', result);
            });
    }
}

module.exports = AWSLoadBalancingClient;
