const Promise = require('the-promise');
const _ = require('the-lodash');

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
                return this.queryParam(name);
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
        if (path) {
            if (!params.ParameterFilters) {
                params.ParameterFilters = [];
            }
            params.ParameterFilters.push({
                Key: 'Path',
                Option: 'Recursive',
                Values: [path]
            });
        }
        if (nextToken) {
            params.NextToken = nextToken;
        }
        return this._ssm.describeParameters(params)
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
    
    queryParam(name)
    {
        var params = {
            Filters: [{
                Key: 'Name',
                Values: [name]
            }]
        };
        return this._ssm.describeParameters(params)
            .then(data => {
                for (var obj of data.Parameters) {
                    return obj;
                }
                return null;
            });
    }    

    deleteParam(name)
    {
        var params = {
            Name: name
        };
        this.logger.info('Deleting Parameter %s...', name);
        this.logger.verbose('Deleting Parameter...', params);
        return this._ssm.deleteParameter(params)
            .then(data => {
                this.logger.verbose('Parameter Deleted:', data);
                return data;
            });
    }
}

module.exports = AWSSystemsManagerClient;
