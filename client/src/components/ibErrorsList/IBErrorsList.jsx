import React from "react";
import './ibErrorsList.css';

const IBErrorsList = ({errors}) => {
  console.log(errors);
  if(!errors) {
    return <></>
  } else {
    return (
      Object.keys(errors).length > 0 && (
          <div className="errors">
              <ul className="list">
              {Object.values(errors).map((value) => (
                  <li key={value}>{value}</li>
              ))}
              </ul>
          </div>
      )
    )
  }
}

export default IBErrorsList