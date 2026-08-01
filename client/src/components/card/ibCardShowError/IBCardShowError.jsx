import { ErrorOutline } from '@mui/icons-material';
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
                key={Date.now()}
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