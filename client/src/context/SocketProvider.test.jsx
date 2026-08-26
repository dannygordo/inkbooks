// SocketProvider.jsx tests. Mocks "socket.io-client" entirely - io() is a real network client and
// has no business connecting anywhere inside a jsdom test. socketUrl() itself is left real (not
// mocked): it already falls back safely to APP_SETTINGS_CONSTANTS.DEVELOPMENT for Vitest's "test"
// mode (see apiUrl.js's own header comment on why that fallback exists), so nothing here needs to
// stub it out.
//
// Explicit React import - see the note in context/auth.test.jsx: Vitest's transform for test
// files needs it even though app code relies on the automatic JSX runtime.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { io } from "socket.io-client";
import { SocketProvider, useSocket } from "./SocketProvider";

const { socketInstances } = vi.hoisted(() => ({ socketInstances: [] }));

vi.mock("socket.io-client", () => ({
	io: vi.fn((url, opts) => {
		const socket = { url, opts, close: vi.fn() };
		socketInstances.push(socket);
		return socket;
	}),
}));

function Consumer() {
	const socket = useSocket();
	return <div data-testid="socket">{socket ? socket.url : "no-socket"}</div>;
}

beforeEach(() => {
	socketInstances.length = 0;
	vi.clearAllMocks();
});

describe("SocketProvider", () => {
	it("opens a socket with the given id in the query and provides it via useSocket", () => {
		render(
			<SocketProvider id="user-1">
				<Consumer />
			</SocketProvider>,
		);

		expect(io).toHaveBeenCalledTimes(1);
		expect(io).toHaveBeenCalledWith(expect.any(String), { query: { id: "user-1" } });
		// The socket returned by io() is the exact value handed down through context - not a copy,
		// not something rebuilt from it.
		expect(screen.getByTestId("socket")).toHaveTextContent(socketInstances[0].url);
	});

	it("re-opens the socket when id changes, closing the previous one", () => {
		const { rerender } = render(
			<SocketProvider id="user-1">
				<Consumer />
			</SocketProvider>,
		);
		expect(io).toHaveBeenCalledTimes(1);
		const firstSocket = socketInstances[0];

		rerender(
			<SocketProvider id="user-2">
				<Consumer />
			</SocketProvider>,
		);

		expect(io).toHaveBeenCalledTimes(2);
		expect(io).toHaveBeenLastCalledWith(expect.any(String), { query: { id: "user-2" } });
		// The effect's cleanup runs before the new one - the old connection must not be left open
		// once a new id supersedes it.
		expect(firstSocket.close).toHaveBeenCalledTimes(1);
	});

	it("closes the socket on unmount", () => {
		const { unmount } = render(
			<SocketProvider id="user-1">
				<Consumer />
			</SocketProvider>,
		);
		const socket = socketInstances[0];

		unmount();

		expect(socket.close).toHaveBeenCalledTimes(1);
	});

	it("useSocket() returns undefined outside any provider (no default value)", () => {
		function Bare() {
			const socket = useSocket();
			return <div data-testid="bare">{String(socket)}</div>;
		}
		render(<Bare />);
		expect(screen.getByTestId("bare")).toHaveTextContent("undefined");
		cleanup();
	});
});
