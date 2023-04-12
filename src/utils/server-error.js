/**
 * @param {import('axios').AxiosError|Error} error - axios error
 * @param {string} startErrorText
 * @returns {string}
 */
export function getErrorText(error, startErrorText = 'Error: ') {
    let errorText;
    // fill errorText with server error
    if ('response' in error) {
        // api.0x.org
        if (error.response?.data.validationErrors?.[0]) {
            // validation error
            errorText = error.response.data.validationErrors[0].description;
        }
        // other apis
        if (error.response.data?.error || error.response.data?.message) {
            errorText = error.response.data.error?.message || error.response.data.message || error.response.data.error;
        }
    }
    // format errorText
    if (errorText) {
        // don't add startErrorText if errorText contains 'error'
        let bothHasError;
        if (typeof startErrorText === 'string' && startErrorText.toLowerCase().indexOf('error') >= 0) {
            if (errorText?.toLowerCase().indexOf('error') >= 0) {
                bothHasError = true;
            }
        }
        return bothHasError ? errorText : startErrorText + errorText;
    }

    // fallbacks
    if (error.message) {
        // network error
        return error.message;
    }
    return 'Something went wrong';
}
