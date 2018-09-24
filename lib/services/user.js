const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSUserClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._iam = parent.getAwsService('iam');
    }

    queryCurrent()
    {
        var params = {
        };
        this.logger.verbose('Query Current User...',  params);
        return this._iam.getUser(params)
            .then(result => {
                if (result.User) {
                    return result.User;
                }
                return null;
            });
    }


}

module.exports = AWSUserClient;
