const Promise = require('the-promise');
const _ = require('lodash');

class AWSSystemsManagerClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ssm = parent.getAwsService('ssm');
    }

    writeParameter(name, value, config)
    {
        var params;
        if (config) {
            params = _.clone(config)
        } else {
            params = {}
            params.Overwrite = true
        }
        params.Name = name;
        if (!params.Type) {
            params.Type = 'String'
        }
        this.logger.info('Writing Parameter %s...', name);
        this.logger.verbose('Writing Parameter...', params);
        params.Value = value;
        return this._ssm.putParameter(params)
            .then(result => {
                this.logger.verbose('Parameter Created:', result);
                return result;
            });
    }

    queryAllParams(path, options, nextToken, results)
    {
        if (!results) {
            results = [];
        }
        var params;
        if (options) {
            params = _.clone(options)
        } else {
            params = {}
        }
        params.Path = path;
        if (nextToken) {
            params.NextToken = nextToken;
        }
        return this._ssm.getParametersByPath(params)
            .then(data => {
                for (var obj of data.Parameters) {
                    results.push(obj);
                }
                if (data.NextToken) {
                    return Promise.resolve(this.queryAllParams(path, options, data.NextToken, results));
                } else {
                    return results;
                }
            });
    }
}

module.exports = AWSSystemsManagerClient;
