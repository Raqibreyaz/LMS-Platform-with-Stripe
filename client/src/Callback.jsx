import axios from "axios"
import { useContext } from "react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { SessionContext } from "./SessionContext"

export default function Callback() {
    const sessionId = new URLSearchParams(location.search).get("session_id")
    if (!sessionId)
        return alert("Invalid Redirection, No Session Id found!")

    const navigate = useNavigate()
    const { fetchSession } = useContext(SessionContext)

    useEffect(() => {
        (async () => {
            const { data } = await axios.post(`http://localhost:4000/complete-checkout/${sessionId}`)

            if (data.error)
                alert(error)

            console.log(data)

            await fetchSession()
            return navigate("/")
        })()
    }, [])

    return null
}