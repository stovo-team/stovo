package broker

import "family-messenger/backend/internal/ports"

type BrokerEvent = ports.Event
type EventHandler = ports.EventHandler
type MessageBrokerService = ports.EventBroker
