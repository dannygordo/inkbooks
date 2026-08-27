import "./ibCalendar.css";
// experimentalStyled was an alpha-era alias for styled() from early MUI 5 - removed in later
// majors, styled() itself has been the stable name the whole time.
import { styled } from "@mui/material/styles";
import Day from "./Day";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid";
import React from "react";

// backgroundColor was a hand-picked light/dark pair (#fff / #1A2027) keyed off
// theme.palette.mode - a leftover from before this file had any theme awareness at all, so it
// never moved when the rest of the app switched to the copper tokens. Every day cell in the grid
// renders through this Item, which is why the whole calendar kept reading as unthemed even after
// ibCalendar.css's own colors were fixed: the cells themselves, underneath those colors, were
// still the old literal hex. var(--ib-surface-card) is the same token every other card-shaped
// surface in the app already uses, and switches with data-theme automatically - no mode check
// needed here anymore.
const Item = styled(Paper)(({ theme }) => ({
	backgroundColor: "var(--ib-surface-card)",
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
	color: theme.palette.text.secondary,
}));

const Month = ({ month }) => {
	return (
		<Box sx={{ flexGrow: 1 }}>
			<Grid
				sx={{ height: 800 }}
				container
				spacing={{ xs: 1, md: 1 }}
				columns={{ xs: 7, sm: 7, md: 7 }}
			>
				{/* Keyed by the row INDEX, not Date.now() + index. A key containing the current time is
				    a new value on every render, so React discarded and rebuilt the entire month grid each
				    time - throwing away the DOM for 35 day cells to redraw the same 35 day cells. Silent,
				    warning-free, and it looks like care. See IBCardWrapper.jsx for what it costs when an
				    input is inside the rebuilt subtree. */}
				{month.map((row, index) => (
					<React.Fragment key={index}>
						{/* MUI 6+'s Grid replaced the old item+xs/sm/md breakpoint props with a single
						    size prop - every non-container Grid is implicitly an "item" now. */}
						{row.map((day, idx) => (
							<Grid size={1} key={idx}>
								<Item>
									<Day day={day} rowIdx={index}/>
								</Item>
							</Grid>
						))}
					</React.Fragment>
				))}
			</Grid>
		</Box>
	);
};

{
	/* {Array.from(Array(30)).map((_, index) => (
          <Grid item xs={1} sm={1} md={1} key={index}>
            <Item>xs=2</Item>
          </Grid>
        ))} */
}

export default Month;
