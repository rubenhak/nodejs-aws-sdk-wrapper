const Promise = require('the-promise');
const _ = require('lodash');

class AWSPolicyClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._iam = parent._iam;
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
        this._logger.verbose('Query Policies %s...',  path);
        return this._iam.listPolicies(params).promise()
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
        this._logger.verbose('Query Policy %s...',  arn);
        return this._iam.getPolicy(params).promise()
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
        this._logger.silly('Query Policy Versions %s...', '', params);
        return this._iam.listPolicyVersions(params).promise()
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
        this._logger.silly('Query Policy Version %s::%s...', arn, versionId);
        this._logger.silly('Query Policy Version %s...', '',  params);
        return this._iam.getPolicyVersion(params).promise()
            .then(data => {
                this._logger.silly('Query Policy Version result:%s...', '', data);
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
        this._logger.info('Creating Policy %s...',  name);
        this._logger.verbose('Creating Policy %s...',  name, params);
        return this._iam.createPolicy(params).promise()
            .then(data => {
                this._logger.verbose('Policy Create Result %s...', name, data);
                return this._fillTheRest(data.Policy);
            });
    }

    update(policy, policyDoc)
    {
        var extraVersions = _.drop(policy.Versions, 4);
        return Promise.serial(extraVersions, x => this._deleteVersion(policy, x.VersionId) )
            .then(() => {
                var params = {
                    PolicyArn: policy.Arn,
                    SetAsDefault: true,
                    PolicyDocument: JSON.stringify(policyDoc)
                };
                this._logger.info('Updating Policy %s...',  policy.PolicyName);
                this._logger.verbose('Updating Policy %s...',  policy.PolicyName, params);
                return this._iam.createPolicyVersion(params).promise()
                    .then(data => {
                        this._logger.verbose('Policy %s updated.',  policy.PolicyName);
                        return data;
                    });
            });
    }

    _deleteVersion(policy, versionId)
    {
        var params = {
            PolicyArn: policy.Arn,
            VersionId: versionId
        };
        this._logger.info('Deleting Policy Version %s :: %s...',  policy.PolicyName, versionId);
        this._logger.verbose('Deleting Policy Version %s...', '', params);
        return this._iam.deletePolicyVersion(params).promise()
            .then(data => {
                this._logger.verbose('Policy version %s :: %s deleted.',  policy.PolicyName, versionId);
                return data;
            });
    }

}

module.exports = AWSPolicyClient;
