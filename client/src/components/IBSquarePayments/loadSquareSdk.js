// Dynamically injects Square's Web Payments SDK script and resolves once window.Square is
// available. Not loaded in index.html unconditionally - only the pages that actually render a
// payment form (via IBSquarePaymentForm.jsx) need this, so it's fetched on demand instead of
// adding a third-party script to every single page load.
//
// Sandbox host only, deliberately, matching the sandbox-only server route this feature posts to
// (see routes/squarePayments.js) - a Sandbox access token/nonce only ever works against Square's
// sandbox host anyway, so this isn't just a style choice. See Square's Web Payments SDK docs
// ("Add the Web Payments SDK to the Web Client") for the sandbox vs. production script URLs.
const SQUARE_SANDBOX_SDK_URL = 'https://sandbox.web.squarecdn.com/v1/square.js';

let loadPromise = null;

export function loadSquareSdk() {
	if (typeof window !== 'undefined' && window.Square) {
		return Promise.resolve(window.Square);
	}
	if (loadPromise) {
		return loadPromise;
	}
	loadPromise = new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = SQUARE_SANDBOX_SDK_URL;
		script.async = true;
		script.onload = () => {
			if (window.Square) {
				resolve(window.Square);
			} else {
				reject(
					new Error(
						'Square Web Payments SDK script loaded but window.Square is not defined.'
					)
				);
			}
		};
		script.onerror = () => {
			loadPromise = null;
			reject(new Error('Failed to load the Square Web Payments SDK script.'));
		};
		document.head.appendChild(script);
	});
	return loadPromise;
}
