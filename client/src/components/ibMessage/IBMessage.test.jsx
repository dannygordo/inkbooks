// IBMessage.jsx tests. A single message bubble - text, optional images, sender avatar (when not
// `own`), and a relative timestamp with the full one on hover (see utils/messageTime.js, which
// this component defers to entirely rather than formatting dates itself).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IBMessage from "./IBMessage";

function messageData(overrides = {}) {
	return {
		id: "msg-1",
		message: "Looking forward to the session!",
		imageUrls: [],
		createdAt: "2026-01-01T12:00:00.000Z",
		user: {
			firstName: "Ash",
			lastName: "Ketchum",
			avatar: "https://cdn.example.com/ash.png",
		},
		...overrides,
	};
}

describe("own vs. someone else's message", () => {
	it("renders the sender's avatar for a message that isn't the viewer's own", () => {
		render(<IBMessage messageData={messageData()} own={false} />);

		const img = screen.getByRole("img", { name: "Ash Ketchum" });
		expect(img).toHaveAttribute("src", "https://cdn.example.com/ash.png");
	});

	it("omits the avatar and adds the own class for the viewer's own message", () => {
		const { container } = render(<IBMessage messageData={messageData()} own={true} />);

		expect(screen.queryByRole("img", { name: "Ash Ketchum" })).not.toBeInTheDocument();
		expect(container.querySelector(".ibMessage.own")).toBeInTheDocument();
	});
});

describe("text", () => {
	it("renders the message text", () => {
		render(<IBMessage messageData={messageData()} own={false} />);

		expect(screen.getByText("Looking forward to the session!")).toBeInTheDocument();
	});

	// An image-only message (see createMessage on the server) has no text at all - guards against
	// an empty <p> still taking up a line, per the component's own inline comment.
	it("renders no text paragraph when the message has none", () => {
		const { container } = render(
			<IBMessage messageData={messageData({ message: "" })} own={false} />,
		);

		expect(container.querySelector(".ibMessageText")).not.toBeInTheDocument();
	});
});

describe("images", () => {
	it("renders each image as a thumbnail linking to its full-size URL in a new tab", () => {
		render(
			<IBMessage
				messageData={messageData({
					imageUrls: [
						"https://cdn.example.com/one.png",
						"https://cdn.example.com/two.png",
					],
				})}
				own={false}
			/>,
		);

		const thumbs = screen.getAllByRole("img", { name: "Attachment" });
		expect(thumbs).toHaveLength(2);
		const links = thumbs.map((img) => img.closest("a"));
		expect(links[0]).toHaveAttribute("href", "https://cdn.example.com/one.png");
		expect(links[0]).toHaveAttribute("target", "_blank");
		expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
		expect(links[1]).toHaveAttribute("href", "https://cdn.example.com/two.png");
	});

	it("renders no image strip when there are no images", () => {
		const { container } = render(
			<IBMessage messageData={messageData({ imageUrls: [] })} own={false} />,
		);

		expect(container.querySelector(".ibMessageImages")).not.toBeInTheDocument();
	});

	// A locally-built optimistic message (see IBChatBox.jsx) may omit imageUrls entirely before
	// the server's real object comes back - the component's own header comment calls this out
	// explicitly, so it's worth pinning as a real test rather than trusting the comment alone.
	it("tolerates a missing imageUrls field instead of throwing", () => {
		const data = messageData();
		delete data.imageUrls;

		expect(() => render(<IBMessage messageData={data} own={false} />)).not.toThrow();
	});
});

describe("timestamp", () => {
	it("shows the full timestamp as the bottom element's title attribute", () => {
		const { container } = render(<IBMessage messageData={messageData()} own={false} />);

		const bottom = container.querySelector(".ibMessageBottom");
		expect(bottom).toHaveAttribute("title");
		expect(bottom.getAttribute("title")).not.toBe("");
	});
});
