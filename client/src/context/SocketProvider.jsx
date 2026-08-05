import React, { useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { socketUrl } from "../utils/apiUrl";

const SocketContext = React.createContext();

export function useSocket() {
	return useContext(SocketContext);
}

export function SocketProvider({ id, children }) {
	const [socket, setSocket] = useState();

	useEffect(() => {
		// Was APP_SETTINGS_CONSTANTS.SOCKET_IO_SERVER_URL, a property that doesn't exist at the
		// top level (it's nested under PRODUCTION/DEVELOPMENT) - io() was silently being called
		// with undefined, which defaults to same-origin. In dev that meant it never reached the
		// real socket.io server on port 5500 at all. Matches the NODE_ENV-scoped lookup already
		// used for GRAPHQL_SERVER_URL in index.js.
		// import.meta.env.MODE (Vite) replaces process.env.NODE_ENV (CRA/webpack) - see index.js's
		// comment on the same swap. Values match exactly ("development"/"production").
		const newSocket = io(socketUrl(), {
			query: { id },
		});
        setSocket(newSocket);

        return () => newSocket.close();
        
	}, [id]);

	return (
		<SocketContext.Provider value={socket}>
			{children}
		</SocketContext.Provider>
	);
}
