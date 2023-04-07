/**
 * @param {import('axios').AxiosError|Error} error - axios error
 * @param {string} startErrorText
 * @returns {string}
 */
export function getErrorText(error, startErrorText = 'Error: ') {
    if ('response' in error && (error.response.data?.error || error.response.data?.message)) {
        // server error
        let errorText = error.response.data.error?.message || error.response.data.message || error.response.data.error;

        // don't add startErrorText if errorText contains 'error'
        let bothHasError;
        if (typeof startErrorText === 'string' && startErrorText.toLowerCase().indexOf('error') >= 0) {
            if (errorText?.toLowerCase().indexOf('error') >= 0) {
                bothHasError = true;
            }
        }
        return bothHasError ? errorText : startErrorText + errorText;
    } else if (error.message) {
        // network error
        return error.message;
    } else {
        return 'Something went wrong';
    }
}
