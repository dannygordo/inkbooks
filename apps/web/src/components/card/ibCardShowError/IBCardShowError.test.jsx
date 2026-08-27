// IBCardShowError.jsx tests.
//
// The full-page "Something Went Wrong!" card shown in place of a page's real content once a
// GraphQL/route error has already happened - see CARD_TYPES.ERROR in constants/app.js, which is
// how pages decide to render this instead of their normal body. It has exactly one interactive
// affordance: the whole card is a click target that calls navigate(-1), i.e. "take me back to
// wherever I was before this broke" - there is no separate "Back" button to find or miss.
//
// Rendered with a real MemoryRouter (two entries) rather than a mocked useNavigate, for the same
// reason EntityList.test.jsx uses a navigation probe instead of asserting on a spy: navigate(-1)
// is a request to the router's own history stack, and the thing worth proving is that clicking
// the card actually lands back on the previous screen, not merely that *some* function got called
// with the argument -1.
//
// `errors` is read as `Object.keys(errors)`/`Object.values(errors)` with no null-guard, so it is
// a required prop - passing undefined/null would throw before render, same as any other required
// prop this codebase doesn't defend against (there is nothing IBCardShowError-specific to test
// there).
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import IBCardShowError from "./IBCardShowError";

function renderCard({ errors = {} } = {}) {
	return render(
		<MemoryRouter initialEntries={["/previous", "/broken"]} initialIndex={1}>
			<Routes>
				<Route path="/previous" element={<div>You made it back</div>} />
				<Route path="/broken" element={<IBCardShowError errors={errors} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("static content", () => {
	it("always shows the 'Something Went Wrong!' title", () => {
		renderCard({ errors: {} });
		expect(screen.getByText("Something Went Wrong!")).toBeInTheDocument();
	});

	it("renders no error list when errors is an empty object", () => {
		const { container } = renderCard({ errors: {} });
		expect(container.querySelector(".errors")).toBeNull();
	});
});

describe("error list", () => {
	it("renders one list item per value in the errors object", () => {
		renderCard({
			errors: {
				email: "Email is required",
				phone: "Phone number is invalid",
			},
		});
		expect(screen.getByText("Email is required")).toBeInTheDocument();
		expect(screen.getByText("Phone number is invalid")).toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
	});

	it("renders values, not keys - the field names themselves never reach the screen", () => {
		renderCard({ errors: { email: "Email is required" } });
		expect(screen.queryByText("email")).not.toBeInTheDocument();
		expect(screen.getByText("Email is required")).toBeInTheDocument();
	});

	it("also renders an errors list built from an array (Object.values works the same on both)", () => {
		// GraphQL error arrays and hand-built validation-error objects both reach this component
		// depending on the caller - the component itself doesn't care which shape it got.
		renderCard({ errors: ["Something broke", "Something else broke"] });
		expect(screen.getByText("Something broke")).toBeInTheDocument();
		expect(screen.getByText("Something else broke")).toBeInTheDocument();
	});
});

describe("clicking the card", () => {
	it("navigates back to the previous entry in history", async () => {
		const user = userEvent.setup();
		renderCard({ errors: { general: "Unexpected error" } });

		await user.click(screen.getByText("Something Went Wrong!"));

		expect(await screen.findByText("You made it back")).toBeInTheDocument();
		expect(screen.queryByText("Something Went Wrong!")).not.toBeInTheDocument();
	});
});
