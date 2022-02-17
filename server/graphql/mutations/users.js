const {gql} = require('apollo-server');

module.exports = gql`
    type Mutation {
        register(registerInput: RegisterInput)
    }
`