/**
 * @param {import('axios').AxiosError|Error} error - axios error
 * @param {string} startErrorText
 * @returns {string}
 */
export function getErrorText(error, startErrorText = 'Error: ') {
    let errorText;
    // fill errorText with server error
    if ('response' in error) {
        /** @type {any} */
        const responseData = error.response.data;
        // api.0x.org
        if (responseData.validationErrors?.[0]) {
            // validation error
            errorText = error.response.data.validationErrors[0].description;
        }
        // other apis
        if (responseData.error || responseData.message) {
            errorText = responseData.error?.message || responseData.message || responseData.error;
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
