const Promise = require('the-promise');
const _ = require('lodash');

class AWSVpcClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent._ec2;
    }

    fetchForCluster(createIfNotPresent, cluster, cidr)
    {
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [
                        cluster
                    ]
                }
            ]
        };
        this.logger.verbose('Fetching vpc %s...',  cluster);

        return this._ec2.describeVpcs(params).promise()
            .then(result => {
                var vpc = null;
                if (result.Vpcs.length > 0) {
                    vpc = result.Vpcs[0];
                }
                if (!createIfNotPresent || vpc) {
                    return vpc;
                } else {
                    return this._createForCluster(cluster, cidr);
                }
            })
            .then(vpc => {
                if (createIfNotPresent) {
                    return this._prepare(vpc, cluster);
                }
                return vpc;
            })
            .then(vpc => {
                this.logger.debug('Fetched VPC. %s', '', vpc);
                return vpc;
            });
    }

    queryAll(cluster)
    {
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [
                        cluster
                    ]
                }
            ]
        };
        this.logger.verbose('Fetching vpc %s...',  cluster);
        return this._ec2.describeVpcs(params).promise()
            .then(result => {
                var vpcs = result.Vpcs;
                return Promise.serial(vpcs, x => this._fetchAllAttributes(x));
            });
    }

    _createForCluster(cluster, cidr)
    {
        var params = {
          CidrBlock: cidr
        };
        var vpcId = null;
        this.logger.info('Creating VPC for %s...', cluster);
        this.logger.verbose('Creating VPC... %s', '', params);
        return this._ec2.createVpc(params).promise()
            .then(result => {
                var vpc = result.Vpc;
                vpcId = vpc.VpcId;
                this.logger.verbose('VPC created %s', '', vpc);
                return vpc;
            });
    }

    _prepare(vpc, cluster) {
        return Promise.resolve()
            .then(() => {
                return this.parent.Ec2utils.setTags(vpc.VpcId, vpc.Tags, { Name : cluster, 'berlioz:cluster': cluster });
            })
            .then(() => {
                return this._waitReady(vpc);
            });
    }

    query(vpcId) {
        var params = {
            VpcIds: [
                vpcId
            ]
        };
        return this._ec2.describeVpcs(params).promise()
            .then(result => {
                if (result.Vpcs.length > 0) {
                    var vpc = result.Vpcs[0];
                    return this._fetchAllAttributes(vpc);
                }
                return null;
            });
    }

    _fetchAllAttributes(vpc)
    {
        this.logger.silly('_fetchAllAttributes... %s', '', vpc);

        return Promise.resolve(vpc)
            .then(x => this._fetchAttrubute(x, 'enableDnsHostnames'))
            .then(x => this._fetchAttrubute(x, 'enableDnsSupport'));
    }

    _fetchAttrubute(vpc, name)
    {
        this.logger.silly('_fetchAllAttribute %s...', name, vpc);

        return this._queryAttribute(vpc.VpcId, name)
            .then(value => {
                if (!vpc.Attributes) {
                    vpc.Attributes = {};
                }
                vpc.Attributes[name] = value;
                return vpc;
            });
    }

    _queryAttribute(vpcId, name)
    {
        var params = {
            Attribute: name,
            VpcId: vpcId
        };
        this.logger.verbose('VPC::_queryAttribute %s :: %s...', vpcId, name, params);

        return this._ec2.describeVpcAttribute(params).promise()
            .then(result => {
                var valueNode = result[_.upperFirst(name)];
                return valueNode.Value;
            });
    }

    setupAttribute(vpcId, name, value)
    {
        var params = {
            VpcId: vpcId
        };
        params[_.upperFirst(name)] = {
            Value: value
        };

        this.logger.info('Vpc::setupAttribute %s :: %s = %s...', vpcId, name, value, params);
        return this._ec2.modifyVpcAttribute(params).promise();
    }

    delete(vpcId) {
        var params = {
            VpcId: vpcId
        };
        this.logger.info('Deleting VPC %s...', vpcId);
        return this._ec2.deleteVpc(params).promise()
            .then(result => {
                return null;
            });
    }

    _waitReady(vpc)
    {
        if (vpc.State == 'available') {
            return vpc;
        }

        this.logger.info('Waiting vpc %s ready...', vpc.VpcId);
        return Promise.timeout(1000)
            .then(() => {
                return this.query(vpc.VpcId);
            })
            .then(vpc => {
                return this._waitReady(vpc);
            });
    }
}

module.exports = AWSVpcClient;
