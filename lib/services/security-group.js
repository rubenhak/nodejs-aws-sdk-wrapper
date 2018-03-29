const _ = require('lodash');

class AWSSecurityGroupClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    fetch(vpcId, name, tags)
    {
        var params = {
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [
                        vpcId
                    ]
                },
                {
                    Name: 'group-name',
                    Values: [
                        name
                    ]
                }
            ]
        };
        this.logger.verbose('Fetching SecurityGroup  %s :: %s...', vpcId, name, params);
        var sgId = null;
        return this._ec2.describeSecurityGroups(params).promise()
            .then(result => {
                var sg = null;
                if (result.SecurityGroups.length > 0) {
                    sg = result.SecurityGroups[0];
                }
                if (sg) {
                    return sg;
                } else {
                    return this._createNew(vpcId, name);
                }
            })
            .then(sg => {
                sgId = sg.GroupId;
                return this.parent.Ec2utils.setTags(sgId, sg.Tags, tags);
            })
            .then(() => {
                return this.query(sgId);
            })
            .then(result => {
                this.logger.verbose('Fetched SecurityGroup %s :: %s.', vpcId, name, result);
                return result;
            });
    }

    _createNew(vpcId, name)
    {
        var params = {
            GroupName: name,
            Description: name,
            VpcId: vpcId
        };
        var sgId = null;
        this.logger.verbose('Creating SecurityGroup... %s', '', params);
        this.logger.info('Creating SecurityGroup %s...', name);
        return this._ec2.createSecurityGroup(params).promise()
            .then(result => {
                sgId = result.GroupId;
                this.logger.verbose('SecurityGroup created %s', sgId, result);
                return this.query(sgId);
            });
    }


    queryAll(tags, nextToken, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
        };
        params.NextToken = nextToken;
        return this._ec2.describeSecurityGroups(params).promise()
            .then(result => {
                for(var x of result.SecurityGroups) {
                    results.push(x);
                }
                if (result.NextToken) {
                    return this.queryAll(tags, result.NextToken, results);
                } else {
                    return results;
                }
            });
    }

    query(sgId) {
        if (!sgId) {
            throw new Error('No security group rovided');
        }
        var params = {
            GroupIds: [
                sgId
            ]
        };
        return this._ec2.describeSecurityGroups(params).promise()
            .then(result => {
                if (result.SecurityGroups.length > 0) {
                    var sg = result.SecurityGroups[0];
                    return sg;
                } else {
                    return null;
                }
            });
    }

    allowSSH(sg)
    {
        return this.allow(sg, 'tcp', 22, [
            {
                CidrIp: '0.0.0.0/0'
            }
        ], []);
    }

    allow(sg, protocol, ports, source)
    {
        return this.configRule(true, sg, protocol, ports, source);
    }

    disallow(sg, protocol, ports, source)
    {
        return this.configRule(false, sg, protocol, ports, source);
    }

    configRule(toBeCreated, sg, protocol, ports, source)
    {
        this.logger.verbose('Configuring SecurityGroup Rule. ToBeCreated:%s, Sg:%s, Protocol: %s, Ports: %s, Source: %s',
            toBeCreated, sg.GroupId, protocol, ports, JSON.stringify(source));

        var config = {
            IpProtocol: protocol
        };
        if ('GroupId' in source) {
            config.UserIdGroupPairs = [{
                GroupId: source.GroupId,
                UserId: source.UserId
            }];
        }
        else {
            config.IpRanges = [{
                CidrIp: source.CidrIp
            }];
        }

        if (Number.isInteger(ports)) {
            config.FromPort = ports;
            config.ToPort = ports;
        } else if (Array.isArray(ports)) {
            config.FromPort = ports[0];
            config.ToPort = ports[1];
        } else {
            throw new Error('Invalid PORTS specified');
        }

        // if (toBeCreated) {
        //     if (this._checkRuleExists(sg.IpPermissions, config)) {
        //         return Promise.resolve();
        //     }
        // }

        var params = {
            GroupId: sg.GroupId,
            IpPermissions: [config]
        };

        if (toBeCreated) {
            this.logger.verbose('Creating SecurityGroup Rule... %s', '', params);
            this.logger.info('Creating SecurityGroup Rule %s...', JSON.stringify(params));
            return this._ec2.authorizeSecurityGroupIngress(params).promise()
                .then(result => {
                    this.logger.verbose('SecurityGroup Rule Created.%s', '', result);
                });
        } else {
            this.logger.verbose('Removing SecurityGroup Rule... %s', '', params);
            this.logger.info('Removing SecurityGroup Rule %s...', JSON.stringify(params));
            return this._ec2.revokeSecurityGroupIngress(params).promise()
                .then(result => {
                    this.logger.verbose('SecurityGroup Rule Deleted.%s', '', result);
                });
        }
    }

    delete(groupId) {
        var params = {
            GroupId: groupId
        };
        this.logger.info('Deleting SecurityGroup %s...', groupId);
        return this._ec2.deleteSecurityGroup(params).promise()
            .then(result => {
                return null;
            });
    }

    // _checkRuleExists(list, rule)
    // {
    //     return _.some(list, x => {
    //         return x.FromPort == rule.FromPort &&
    //                 x.ToPort == rule.ToPort &&
    //                 x.IpProtocol == rule.IpProtocol &&
    //                 x.IpRanges.CidrIp == rule.IpRanges.CidrIp;
    //     })
    // }
}




module.exports = AWSSecurityGroupClient;
