# Collections & Sharing Cards
This document covers the technical details behind sharing cards.
## Collections
A Collection consists of some amount of cards, and possibly some money. A collection is created in a user's account with the following command:
`collect <picons> <card0,card1,...,cardN>`
This will output a collection ID and will remove the requested resources from the user's account. After this, no one really owns the collection, but anyone can "redeem" a collection if they have the corresponding collection ID. This is why it is important to keep track of collection IDs as if they were passwords.

The contents of a collection can be accessed with the following command: `redeem <collection-ID>` This will add the contents of the collection to the current user's account.

To see the contents of a collection without taking them out, the `peek` command can be used instead of redeem. It will return the contents of the collection in the same format that items are passed to the `collect` command, but cards will be sorted by index for readability. You do ***not*** need to be logged in to use this command.

To change the ID of a collection, use the command `recol <current-ID>` to "recollect" the collection. The previous ID will no longer work, and the collection will now be under the new collection ID. As with `collect`, the collection ID will be printed out. You do ***not*** need to be logged in to use this command.
## Sharing
This is only a recommended protocol for two-way trades, but it will work well.
1. The users will negotiate the trade however they see fit, via chat services or other means.
2. They will determine a trading agent and will both connect to it, possibly via the Fusion chat interface.
3. They will both send the following information to the trading agent, separated by newlines:
   - The ID of a collection containing what they will give to the other user
   - What they expect to receive from the other user. The recommended format is the same as the order of the arguments that are passed to the `collect` command. For simplicity, the user should be responsible for sorting the cards by their number unless otherwise specified.
   - Other optional information, such as custom timeouts or a memo.
4. The agent will `recol` both of the collection IDs from both of the users and `peek` at them.
5. If the contents of the collections match what the other user has requested, the agent will send back `true\n` followed by the recollected ID with the other user's contents and the trade is successful!

   Otherwise, the agent will send back `false\n` followed by the recollected id of what the user sent in. The trade has failed. `:(`
6. Both users will disconnect.
