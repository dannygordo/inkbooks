import React, { useContext, useEffect, useState } from "react";

const GlobalContext = React.createContext();

export function useGlobal() {
	return useContext(GlobalContext);
}