// Rewritten for Square's current Web Payments SDK (Square.payments()/card()/tokenize()) - the
// previous version of this file configured Square's old SqPaymentForm API, which Square retired
// years ago; that component (IBSquarePaymentForm.jsx) was never actually wired into any page and
// would have failed to initialize the moment it was, since nothing in this codebase ever loaded
// the (long-dead) SqPaymentForm script it depended on. See PRODUCTION_ROADMAP.md's Phase 4
// write-up for the full history.
import { SQUARE } from "../../config";

const squareConfig = {
	applicationId: SQUARE.SANDBOX.APPLICATION_ID,
	locationId: SQUARE.SANDBOX.LOCATION_ID,
};

export default squareConfig;
