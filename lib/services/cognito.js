const _ = require('the-lodash');
const Promise = require('the-promise');

class AWSCognitoClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._cognitoISP = parent.getAwsService('cognitoidentityserviceprovider');
        // this._cognito = parent.getAwsService('cognitoidentity');
    }
    
    queryUserPools(prefix, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            MaxResults: 10
        };
        if (nextToken) {
            params.NextToken = nextToken;
        }
        this.logger.verbose('listUserPools %s...',  prefix);
        return this._cognitoISP.listUserPools(params)
            .then(result => {
                var items = result.UserPools;
                if (prefix) {
                    items = items.filter(x => _.startsWith(x.Name, prefix))
                }
                return Promise.serial(items, x => this.queryUserPool(x.Id))
                    .then(fullItems => {
                        results = _.concat(results, fullItems);
                        if (result.NextToken) {
                            return this.queryUserPools(prefix, result.NextToken, results)
                        }
                        return results;
                    })
            });
    }

    queryUserPool(id)
    {
        var params = {
            UserPoolId: id
        };
        this.logger.verbose('describeUserPool ...',  params);
        return this._cognitoISP.describeUserPool(params)
            .then(result => {
                if (result.UserPool) {
                    return result.UserPool;
                } 
                return null;
            });
    }

    createUserPool(name, config)
    {
        var params = {
            PoolName: name
        };
        if (config) {
            params = _.defaults(params, config);
        }
        this.logger.verbose('createUserPool ...',  params);
        return this._cognitoISP.createUserPool(params)
            .then(result => {
                if (result.UserPool) {
                    return result.UserPool;
                } 
                return null;
            });
    }

    updateUserPool(id, config)
    {
        var params = {
            UserPoolId: id
        };
        if (config) {
            params = _.defaults(params, config);
        }
        this.logger.verbose('updateUserPool ...',  params);
        return this._cognitoISP.updateUserPool(params)
            .then(result => {
                return result;
            });
    }

    addUserPoolCustomAttribute(id, attributeConfig)
    {
        var params = {
            UserPoolId: id,
            CustomAttributes: [
                attributeConfig
            ]
        };
        this.logger.verbose('addUserPoolCustomAttribute ...',  params);
        return this._cognitoISP.addCustomAttributes(params)
            .then(result => {
                return result;
            });
    }

    deleteUserPool(id)
    {
        var params = {
            UserPoolId: id
        };
        this.logger.verbose('deleteUserPool ...',  params);
        return this._cognitoISP.deleteUserPool(params)
            .then(result => {
                return result;
            });
    }

    queryUserPoolClients(poolId, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            UserPoolId: poolId,
            MaxResults: 10
        };
        if (nextToken) {
            params.NextToken = nextToken;
        }
        this.logger.verbose('listUserPoolClients %s...', params);
        return this._cognitoISP.listUserPoolClients(params)
            .then(result => {
                var items = result.UserPoolClients;
                return Promise.serial(items, x => this.queryUserPoolClient(poolId, x.ClientId))
                    .then(fullItems => {
                        results = _.concat(results, fullItems);
                        if (result.NextToken) {
                            return this.queryUserPoolClients(poolId, result.NextToken, results)
                        }
                        return results;
                    })
            });
    }

    queryUserPoolClient(id, clientId)
    {
        var params = {
            UserPoolId: id,
            ClientId: clientId
        };
        this.logger.verbose('describeUserPoolClient ...',  params);
        return this._cognitoISP.describeUserPoolClient(params)
            .then(result => {
                if (result.UserPoolClient) {
                    return result.UserPoolClient;
                } 
                return null;
            });
    }

    createUserPoolClient(userPoolId, name, config)
    {
        var params = {
            UserPoolId: userPoolId,
            ClientName: name
        };
        if (config) {
            params = _.defaults(params, config);
        }
        this.logger.verbose('createUserPoolClient ...',  params);
        return this._cognitoISP.createUserPoolClient(params)
            .then(result => {
                if (result.UserPoolClient) {
                    return result.UserPoolClient;
                } 
                return null;
            });
    }

    updateUserPoolClient(userPoolId, id, config)
    {
        var params = {
            UserPoolId: userPoolId,
            ClientId: id
        };
        if (config) {
            params = _.defaults(params, config);
        }
        this.logger.verbose('updateUserPoolClient ...',  params);
        return this._cognitoISP.updateUserPoolClient(params)
            .then(result => {
                if (result.UserPoolClient) {
                    return result.UserPoolClient;
                } 
                return null;
            });
    }

    deleteUserPoolClient(userPoolId, id)
    {
        var params = {
            UserPoolId: userPoolId,
            ClientId: id
        };
        this.logger.verbose('deleteUserPoolClient ...',  params);
        return this._cognitoISP.deleteUserPoolClient(params)
            .then(result => {
                return result;
            });
    }

    queryUser(id, username)
    {
        var params = {
            UserPoolId: id,
            Username: username
        };
        this.logger.verbose('queryUser ...',  params);
        return this._cognitoISP.adminGetUser(params)
            .then(result => {
                if (!result.UserAttributes) {
                    result.Attributes = {}
                } else {
                    result.Attributes = _.makeDict(result.UserAttributes, x => x.Name, x => x.Value);
                }
                return result;
            })
            .catch(reason => {
                if (reason.code == 'UserNotFoundException') {
                    return null;
                } else {
                    throw reason;
                }
            });
    }

    adminDeleteUser(id, username)
    {
        var params = {
            UserPoolId: id,
            Username: username
        };
        this.logger.verbose('adminDeleteUser ...',  params);
        return this._cognitoISP.adminDeleteUser(params)
            .then(result => {
                return result;
            })
            .catch(reason => {
                if (reason.code == 'UserNotFoundException') {
                    return null;
                } else {
                    throw reason;
                }
            });
    }

    changePassword(accessToken, newPassword, prevPassword)
    {
        var params = {
            AccessToken: accessToken,
            ProposedPassword: newPassword,
            PreviousPassword: prevPassword
        };
        this.logger.verbose('changePassword ...',  params);
        return this._cognitoISP.changePassword(params)
            .then(result => {
                return {
                    success: true
                };
            })
            .catch(reason => {
                if (reason.code == 'NotAuthorizedException') {
                    return {
                        success: false
                    };
                } else {
                    throw reason;
                }
            });
    }
}

module.exports = AWSCognitoClient;
