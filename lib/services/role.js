const Promise = require('the-promise');
const _ = require('lodash');

class AWSRoleClient
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
            Marker: marker
        };
        this.logger.verbose('Query Roles %s...',  path);
        return this._iam.listRoles(params).promise()
            .then(data => {
                return Promise.serial(data.Roles, x => this._fillTheRest(x))
                    .then(roles => {
                        for(var role of roles) {
                            result.push(role);
                        }

                        if (data.Marker) {
                            return this.queryAll(path, data.Marker, result);
                        }

                        return result;
                    });
            });
    }

    query(name)
    {
        var params = {
            RoleName: name
        };
        this.logger.verbose('Query Role %s...',  name, params);
        return this._iam.getRole(params).promise()
            .then(data => {
                if (!data.Role) {
                    return null;
                }
                return this._fillTheRest(data.Role);
            });
    }

    _fillTheRest(role)
    {
        var doc = role.AssumeRolePolicyDocument;
        doc = unescape(doc);
        doc = JSON.parse(doc);
        role.AssumeRolePolicyDocument = doc;
        return this._getAttachedPolicies(role.RoleName)
            .then(attachments => {
                role.Attachments = attachments;
                return role;
            });
    }

    _getAttachedPolicies(roleName, marker, result)
    {
        if (!result) {
            result = [];
        }
        var params = {
            RoleName: roleName,
            Marker: marker
        };
        this.logger.silly('Query Role Attachments %s...', '', params);
        return this._iam.listAttachedRolePolicies(params).promise()
            .then(data => {
                this.logger.silly('Query Role Attachments Result%s...', '', data);
                return data.AttachedPolicies;
            });
    }

    create(name, path, policyDoc)
    {
        var params = {
            RoleName: name,
            Path: path,
            AssumeRolePolicyDocument: JSON.stringify(policyDoc)
        };
        this.logger.info('Creating Role %s...',  name);
        this.logger.verbose('Creating Role %s...',  name, params);
        return this._iam.createRole(params).promise()
            .then(data => {
                this.logger.verbose('Created Role %s...',  name, data);
                return data.Role;
            });
    }

    update(role, policyDoc)
    {
        var params = {
            RoleName: role.RoleName,
            PolicyDocument: JSON.stringify(policyDoc)
        };
        this.logger.info('Updating Role Policy Document %s...',  role.RoleName);
        this.logger.verbose('Updating Role Policy Document %s...',  role.RoleName, params);
        return this._iam.updateAssumeRolePolicy(params).promise()
            .then(data => {
                this.logger.verbose('Role Policy Document %s updated.',  role.RoleName);
                return data;
            });
    }

    remove(name)
    {
        var params = {
            RoleName: name,
        };
        this.logger.info('Deleting Role %s...',  name);
        this.logger.verbose('Deleting Role %s...',  name, params);
        return this._iam.deleteRole(params).promise()
            .then(data => {
                this.logger.verbose('Deleted Role %s...',  name, data);
            });
    }

    attachPolicy(role, policyArn)
    {
        var params = {
            RoleName: role.RoleName,
            PolicyArn: policyArn
        };
        this.logger.info('Attaching Policy %s to Role %s...', policyArn, role.RoleName);
        this.logger.verbose('Attaching Policy to Role %s...', '', params);
        return this._iam.attachRolePolicy(params).promise()
            .then(data => {
                this.logger.verbose('Policy attached to Role. Result:%s.', '', data);
            });
    }

    detachPolicy(role, policyArn)
    {
        var params = {
            RoleName: role.RoleName,
            PolicyArn: policyArn
        };
        this.logger.info('Dettaching Policy %s from Role %s...', policyArn, role.RoleName);
        this.logger.verbose('Dettaching Policy from Role %s...', '', params);
        return this._iam.detachRolePolicy (params).promise()
            .then(data => {
                this.logger.verbose('Policy dettaching from Role. Result:%s.', '', data);
            });
    }
}

module.exports = AWSRoleClient;
