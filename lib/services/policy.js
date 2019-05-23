const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSPolicyClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._iam = parent.getAwsService('iam');
    }

    queryAll(path, marker, result)
    {
        if (!result) {
            result = [];
        }

        var params = {
            PathPrefix: path,
            OnlyAttached: false,
            Marker: marker,
            Scope: 'Local'
        };
        this.logger.verbose('Query Policies %s...',  path);
        return this._iam.listPolicies(params)
            .then(data => {
                return Promise.serial(data.Policies, x => this._fillTheRest(x))
                    .then(policies => {
                        for(var policy of policies) {
                            result.push(policy);
                        }

                        if (data.Marker) {
                            return this.queryAll(path, data.Marker, result);
                        }

                        return result;
                    });
            });
    }

    query(arn)
    {
        var params = {
            PolicyArn: arn
        };
        this.logger.verbose('Query Policy %s...',  arn);
        return this._iam.getPolicy(params)
            .then(data => {
                if (!data.Policy) {
                    return null;
                }
                return this._fillTheRest(data.Policy);
            });
    }

    _fillTheRest(policy)
    {
        return this._getVersions(policy.Arn)
            .then(versions => {
                policy.Versions = versions;
                return this._getVersion(policy.Arn, policy.DefaultVersionId);
            })
            .then(version => {
                policy.DefaultVersion = version;
                return policy;
            });
    }

    _getVersions(arn)
    {
        var params = {
            PolicyArn: arn
        };
        this.logger.silly('Query Policy Versions %s...', '', params);
        return this._iam.listPolicyVersions(params)
            .then(data => {
                return data.Versions;
            });
    }

    _getVersion(arn, versionId)
    {
        var params = {
            PolicyArn: arn,
            VersionId: versionId
        };
        this.logger.silly('Query Policy Version %s::%s...', arn, versionId);
        this.logger.silly('Query Policy Version %s...', '',  params);
        return this._iam.getPolicyVersion(params)
            .then(data => {
                this.logger.silly('Query Policy Version result:%s...', '', data);
                if (data.PolicyVersion) {
                    var doc = data.PolicyVersion.Document;
                    doc = unescape(doc);
                    doc = JSON.parse(doc);
                    data.PolicyVersion.Document = doc;
                }
                return data.PolicyVersion;
            });
    }

    create(name, path, policyDoc)
    {
        var params = {
            PolicyName: name,
            Path: path,
            PolicyDocument: JSON.stringify(policyDoc)
        };
        this.logger.info('Creating Policy %s...',  name);
        this.logger.verbose('Creating Policy %s...',  name, params);
        return this._iam.createPolicy(params)
            .then(data => {
                this.logger.verbose('Policy Create Result %s...', name, data);
                return this._fillTheRest(data.Policy);
            });
    }

    update(policy, policyDoc)
    {
        var versions = policy.Versions.filter(x => !x.IsDefaultVersion);
        var extraVersions = _.drop(versions, 4);
        return Promise.serial(extraVersions, x => this._deleteVersion(policy.Arn, x.VersionId))
            .then(() => {
                var params = {
                    PolicyArn: policy.Arn,
                    SetAsDefault: true,
                    PolicyDocument: JSON.stringify(policyDoc)
                };
                this.logger.info('Updating Policy %s...',  policy.PolicyName);
                this.logger.verbose('Updating Policy %s...',  policy.PolicyName, params);
                return this._iam.createPolicyVersion(params)
                    .then(data => {
                        this.logger.verbose('Policy %s updated.',  policy.PolicyName);
                        return data;
                    });
            });
    }

    remove(policyArn)
    {
        return this._getVersions(policyArn)
        .then(versions => {
            this.logger.info('Versions: ', versions);
            return Promise.serial(versions, x => {
                if (!x.IsDefaultVersion) {
                    return this._deleteVersion(policyArn, x.VersionId)
                }
            })
        })
        .then(() => {
            var params = {
                PolicyArn: policyArn
            };
            this.logger.info('Deleting Policy %s...',  policyArn);
            this.logger.verbose('Deleting Policy %s...', '', params);
            return this._iam.deletePolicy(params)
                .then(data => {
                    this.logger.verbose('Policy version %s deleted.',  policyArn);
                });
        });
    }

    _deleteVersion(policyArn, versionId)
    {
        var params = {
            PolicyArn: policyArn,
            VersionId: versionId
        };
        this.logger.info('Deleting Policy Version %s :: %s...',  policyArn, versionId);
        this.logger.verbose('Deleting Policy Version %s...', '', params);
        return this._iam.deletePolicyVersion(params)
            .then(data => {
                this.logger.verbose('Policy version %s :: %s deleted.', policyArn, versionId);
                return data;
            });
    }

}

module.exports = AWSPolicyClient;
