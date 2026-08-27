// ErrorOutline (the bare/default-style export) was removed from @mui/icons-material's current
// major - ErrorOutlined (the outlined-style rendering of the base Error icon) is the current
// export with the same visual look. Imported but never actually rendered in this file either
// way - pre-existing dead import, left as-is rather than also removing it in this pass.
import { ErrorOutlined } from '@mui/icons-material';
import React from 'react'
import './ibCardShowError.css';
import { useNavigate } from 'react-router-dom';

const IBCardShowError = (props) => {
    const {errors} = props;
    const navigate = useNavigate();
  return (
    <div className="ibCardShowError">
        <div className="ibCardShowErrorContainer">
            <div
                className="ibCardShowErrorCard"
                onClick={(e) =>
                    navigate(-1)
                }
                >
                
                <div className="ibCardShowErrorBottom">
                    <span className="ibCardShowErrorDetailsTitle">Something Went Wrong!</span>
                    { Object.keys(errors).length > 0 && (
                        <div className="errors">
                        <ul className="list">
                        {Object.values(errors).map((value) => (
                            <li key={value}>{value}</li>
                            ))}
                        </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  )
}

export default IBCardShowError