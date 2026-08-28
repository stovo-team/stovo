package broker

import "stovo-messenger/backend/internal/ports"

type BrokerEvent = ports.Event
type EventHandler = ports.EventHandler
type MessageBrokerService = ports.EventBroker
