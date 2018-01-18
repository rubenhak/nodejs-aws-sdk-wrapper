const Promise = require('the-promise');
const _ = require('lodash');
const shell = require('shelljs');
const ArchiveTools = require('../archive-tools');

class AWSLambdaClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._lambda = parent._lambda;
    }

    updateFunctionCode(functionName, path)
    {
        this.logger.info('Compressing %s for %s Lambda function...', path, functionName);
        return ArchiveTools.compressDirectoryToBuffer(path)
            .then(zipData => {
                zipData.path = path;
                return this._updateFunctionCodeFromBuffer(functionName, zipData)
            });
    }

    _updateFunctionCodeFromBuffer(functionName, zipData)
    {
        this.logger.info('Updating %s Lambda Code from %s...', functionName, zipData.path);
        var params = {
            FunctionName: functionName,
            Publish: true,
            ZipFile: zipData
        };
        return this._lambda.updateFunctionCode(params).promise()
            .then(() => {
                this.logger.info('Lambda Function Code %s updated.', functionName);
            });
    }
}

module.exports = AWSLambdaClient;
