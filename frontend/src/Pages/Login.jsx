import axios from 'axios'
import React from 'react'
import { useState } from 'react'

const Login = () => {
    const[details,setDetails]=useState({
        username:"",
        password:""
    })

    function handleChange(e){
        setDetails(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    async function  handleSubmit(e){
        e.preventDefault();
        const { username, password } = details;
        if (!username || !password) {
            alert("Please fill in all fields");
            return;
        }
        try {
            const data = await axios.post(import.meta.env.VITE_SERVER+"/api/restaurant/login",details);
            setDetails({
                username:"",
                password:""
            })
            console.log(data.data);
            if(data.data.accessToken){
                localStorage.setItem("accessToken",data.data.accessToken);
                window.location.href = "/admin";
            }
        } catch (error) {
            console.error("Login failed:", error);
        }
    }

  return (
    <div>
        <input name='username' value={details.username} onChange={handleChange} type="text" />
        <input name='password' value={details.password} onChange={handleChange} type="password" />
        <input type="submit" onClick={handleSubmit} />
    </div>
  )
}

export default Login