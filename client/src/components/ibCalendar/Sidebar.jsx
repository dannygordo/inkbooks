import { Checkbox, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/auth";
import { useCalendar } from "../../context/calendar";
import { ArtistService } from "../../services/ArtistService";
import CreateEventButton from "./CreateEventButton";
import "./ibCalendar.css";
import SmallCalendar from "./SmallCalendar";

const Sidebar = () => {
	const { user } = useAuth();
	const { savedEvents, setSavedEvents, filteredEvents, setFilteredEvents } = useCalendar();
  const { visibleEvents, setVisibleEvents } = useState([]);
	// See IBCalendar.jsx's matching comment - user.userInfo.shop is legitimately absent for an
	// independent artist. Optional-chained to undefined, which fetchArtistsByShop's own skip
	// guard now treats as "nothing to fetch" instead of crashing.
	const { data, loading } = ArtistService.fetchArtistsByShop(
		user.userInfo?.shop?.id
	);
	let events = [];

	const [checked, setChecked] = useState([]);

  const removeEvents = (evnt, artist) => {
    if(evnt.userId !== artist.user.id) {
      return true;
    }
      return false
  };

  const addEvents = (evnt, artist) => {
    if(evnt.userId === artist.user.id) {
      return true;
    }
      return false
  };

	const handleToggle = (artist) => () => {
		let newChecked = [...checked];
    if (checked.some(e => e.artist.user.id === artist.user.id)) {
      console.log(newChecked);
			newChecked = newChecked.filter(item => item.artist.user.id !== artist.user.id);
      setFilteredEvents([...savedEvents.filter((event) => removeEvents(event, artist))]);

    } else {
      newChecked.push({artist: artist});
      console.log(newChecked);
      setFilteredEvents([ ...filteredEvents, ...savedEvents.filter((event) => addEvents(event, artist))]);
    }
		setChecked(newChecked);
    //setFilteredEvents(events);
	};
  // useEffect(() => {
  //   // checked.map((check, index) => {
  //   //   if (savedEvents.some(e => e.userId === check.artist.user.id)) {
  //   //     events = savedEvents.filter((event) => changeEvents(event, check))
  //   //   }
  //   // });
  //   setFilteredEvents(events);
  // }, [checked]);

  useEffect(() => {
    if(data) {
      let checkAll = [];
      data.getArtistsByShop.map((artist, index) => {
        checkAll.push({artist: artist});
      });

      setChecked(checkAll);
    }
  }, [data]); 

	// useEffect(() => {
	// 	events = savedEvents;
	// }, [savedEvents]);

	return (
		<aside className="ibCalendarAsideContainer">
			<CreateEventButton />
			<SmallCalendar />
			<div style={{ marginTop: 75 }}>
				<h3>Artists</h3>
			</div>
      {data &&
        <div>
          <List
            sx={{
              width: "100%",
              maxWidth: 360,
              bgcolor: "background.paper",
            }}
          >
            {data.getArtistsByShop.map((artist, index) => {
              const labelId = `checkbox-list-label-${index}`;

              return (
                <ListItem
                  key={index}
                  disablePadding
                >
                  <ListItemButton
                    role={undefined}
                    onClick={handleToggle(artist)}
                    dense
                  >
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={
                          checked.some(x => x.artist.user.id === artist.user.id)
                        }
                        sx={{
                          color: artist.user.tagColor,
                          '&.Mui-checked': {
                            color: artist.user.tagColor,
                          },
                        }}
                        tabIndex={-1}
                        disableRipple
                        inputProps={{
                          "aria-labelledby": labelId,
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      id={labelId}
                      sx={{fontWeight: 800}}
                      primaryTypographyProps={{
                        fontWeight: 800,
                        letterSpacing: 0,
                      }}
                      primary={`${artist.user.firstName} ${artist.user.lastName}`}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </div>
      }
		</aside>
	);
};

export default Sidebar;
