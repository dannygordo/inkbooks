import React from "react";
import './ibCard.css';

const IBCardWrapper = ({children, handleClick}) => {
    if(handleClick) {
        return (
            <div className="ibCardWrapperClickable" key={Date.now()} onClick={(e) => handleClick}>
                {children}
            </div>
        );
    } else {
        return (
            <div className="ibCardWrapper" key={Date.now()}>
                {children}
            </div>
        );
    }
};

export default IBCardWrapper;
