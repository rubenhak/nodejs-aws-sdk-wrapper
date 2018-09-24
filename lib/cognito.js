const Promise = require('the-promise');
const _ = require('the-lodash');

class CognitoHelper 
{
    constructor(logger, cognito)
    {
        this._logger = logger;
        this._cognito = cognito;
        this._userPools = {};
        this._userPoolClients = [];
    }

    get allUserPools() {
        return _.values(this._userPools);
    }

    get allUserPoolClients() {
        return this._userPoolClients;
    }

    getUserPool(id) {
        return this._userPools[id];
    }

    setAPIFilter(value)
    {
        this._filter = value;
    }

    refresh()
    {
        this._userPools = {};
        this._userPoolClients = [];
        return this._cognito.queryUserPools(this._filter)
            .then(results => {
                for(var x of results) {
                    this._userPools[x.Id] = x;
                }
            })
            .then(() => Promise.serial(this.allUserPools, x => {
                return this._cognito.queryUserPoolClients(x.Id)
                    .then(results => {
                        for(var result of results) {
                            result.UserPoolName = this._userPools[result.UserPoolId].Name;
                        }
                        this._userPoolClients = _.concat(this._userPoolClients, results);
                    })
            }));
    }

    queryUserPoolClient(id, clientId)
    {
        return this._cognito.queryUserPoolClient(id, clientId)
            .then(result => {
                if (result) {
                    result.UserPoolName = this._userPools[result.UserPoolId].Name;
                }
                return result;
            })
    }

    createUserPoolClient(id, name, config)
    {
        return this._cognito.createUserPoolClient(id, name, config)
            .then(result => {
                if (result) {
                    result.UserPoolName = this._userPools[result.UserPoolId].Name;
                }
                return result;
            })
    }

    createUserPool(name, config)
    {
        return this._cognito.createUserPool(name, config)
            .then(result => {
                if (result) {
                    this._userPools[result.Id] = result;
                }
                return result;
            })
    }
}

module.exports = CognitoHelper;