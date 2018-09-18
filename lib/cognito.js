const Promise = require('the-promise');
const _ = require('lodash');

class CognitoHelper 
{
    constructor(logger, cognito)
    {
        this._logger = logger;
        this._cognito = cognito;
        this._userPools = [];
        this._userPoolClients = [];
    }

    get allUserPools() {
        return this._userPools;
    }

    get allUserPoolClients() {
        return this._userPoolClients;
    }

    setAPIFilter(value)
    {
        this._filter = value;
    }

    refresh()
    {
        this._userPools = [];
        this._userPoolClients = [];
        return this._cognito.queryUserPools(this._filter)
            .then(results => {
                this._userPools = results;
            })
            .then(() => Promise.serial(this._userPools, x => {
                return this._cognito.queryUserPoolClients(x.Id)
                    .then(results => {
                        this._userPoolClients = _.concat(this._userPoolClients, results);
                    })
            }));
    }
}

module.exports = CognitoHelper;