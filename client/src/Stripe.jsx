import React, { useCallback, useEffect, useContext } from "react";
import { loadStripe } from '@stripe/stripe-js';
import {
    EmbeddedCheckoutProvider,
    EmbeddedCheckout
} from '@stripe/react-stripe-js';
import api from './api'
import { useNavigate, useLocation } from "react-router-dom"
import { SessionContext } from "./SessionContext"

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_API_KEY);

export const CheckoutForm = () => {
    const fetchClientSecret = useCallback(() => {
        return api.post('/create-checkout').then(({ data }) => data.clientSecret)
    }, []);

    const options = { fetchClientSecret };

    return (
        <div id="checkout">
            <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={options}
            >
                <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
        </div>
    )
}

export const Return = () => {
    const location = useLocation()
    const sessionId = new URLSearchParams(location.search).get("session_id")
    if (!sessionId) {
        console.log(location.search)
        return alert("Invalid Redirection, No Session Id found!")
    }

    const navigate = useNavigate()
    const { fetchSession } = useContext(SessionContext)

    useEffect(() => {
        (async () => {
            const { data } = await api.post(`/complete-checkout/${sessionId}`)

            if (data.error) {
                alert(data.error)
            }

            console.log(data)

            await fetchSession()
            return navigate("/")
        })()
    }, [])

    return null
}