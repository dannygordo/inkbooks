import "./ibCalendar.css";
// experimentalStyled was an alpha-era alias for styled() from early MUI 5 - removed in later
// majors, styled() itself has been the stable name the whole time.
import { styled } from "@mui/material/styles";
import Day from "./Day";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid";
import React from "react";

const Item = styled(Paper)(({ theme }) => ({
	backgroundColor: theme.palette.mode === "dark" ? "#1A2027" : "#fff",
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
				{month.map((row, index) => (
					<React.Fragment key={Date.now() + index}>
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
