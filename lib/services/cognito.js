const _ = require('lodash');
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
}

module.exports = AWSCognitoClient;
